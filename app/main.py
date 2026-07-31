import base64
import json
import os
import secrets
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import db
from app.go_engine import Board, IllegalMoveError, BLACK, WHITE
from app import sgf as sgf_mod
from app import bot as bot_mod

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

app = FastAPI(title="윤남매 바둑교실")

# 배포 환경에서 APP_PASSWORD 환경변수가 설정되어 있으면 HTTP Basic 인증으로 전체 앱을 보호한다.
# 로컬 개발(환경변수 미설정) 시에는 인증 없이 그대로 사용 가능하다.
APP_PASSWORD = os.environ.get("APP_PASSWORD")


@app.middleware("http")
async def basic_auth_guard(request: Request, call_next):
    if not APP_PASSWORD:
        return await call_next(request)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            _, _, password = decoded.partition(":")
        except Exception:
            password = ""
        if secrets.compare_digest(password, APP_PASSWORD):
            return await call_next(request)
    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="baduk-classroom"'},
        content="Authentication required.",
    )


app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

db.init_db()


def load_json(name):
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/", response_class=HTMLResponse)
def index():
    return (BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8")


# ---------------- 학습(lessons) ----------------

@app.get("/api/lessons")
def get_lessons():
    return load_json("lessons.json")


@app.get("/api/news")
def get_news():
    data = load_json("news.json")
    items = sorted(data["items"], key=lambda x: x["date"], reverse=True)
    return {"items": items}


@app.get("/api/lessons/progress")
def get_lesson_progress():
    conn = db.get_conn()
    rows = conn.execute("SELECT lesson_id, completed FROM lesson_progress").fetchall()
    conn.close()
    return {r["lesson_id"]: bool(r["completed"]) for r in rows}


class LessonCompleteBody(BaseModel):
    lesson_id: str
    completed: bool = True


@app.post("/api/lessons/progress")
def set_lesson_progress(body: LessonCompleteBody):
    conn = db.get_conn()
    conn.execute(
        """INSERT INTO lesson_progress (lesson_id, completed, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(lesson_id) DO UPDATE SET completed=excluded.completed, updated_at=excluded.updated_at""",
        (body.lesson_id, int(body.completed), db.now()),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ---------------- 사활 테스트(tsumego) ----------------

@app.get("/api/tsumego")
def get_tsumego():
    return load_json("tsumego.json")


@app.get("/api/tsumego/progress")
def get_tsumego_progress():
    conn = db.get_conn()
    rows = conn.execute("SELECT puzzle_id, solved, attempts, last_result FROM tsumego_progress").fetchall()
    conn.close()
    return {r["puzzle_id"]: {"solved": bool(r["solved"]), "attempts": r["attempts"], "last_result": r["last_result"]} for r in rows}


class TsumegoAttemptBody(BaseModel):
    puzzle_id: str
    correct: bool


@app.post("/api/tsumego/attempt")
def record_tsumego_attempt(body: TsumegoAttemptBody):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM tsumego_progress WHERE puzzle_id=?", (body.puzzle_id,)).fetchone()
    attempts = (row["attempts"] if row else 0) + 1
    solved = (row["solved"] if row else 0) or (1 if body.correct else 0)
    conn.execute(
        """INSERT INTO tsumego_progress (puzzle_id, solved, attempts, last_result, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(puzzle_id) DO UPDATE SET solved=excluded.solved, attempts=excluded.attempts,
               last_result=excluded.last_result, updated_at=excluded.updated_at""",
        (body.puzzle_id, solved, attempts, "correct" if body.correct else "wrong", db.now()),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "attempts": attempts, "solved": bool(solved)}


# ---------------- 자유 연습판(연습 대국) ----------------

class MoveBody(BaseModel):
    size: int
    grid: List[List[int]]
    color: str  # "black" | "white"
    x: int
    y: int
    ko_point: Optional[List[int]] = None


@app.post("/api/board/move")
def board_move(body: MoveBody):
    color = BLACK if body.color == "black" else WHITE
    b = Board(body.size)
    b.grid = body.grid
    b.ko_point = tuple(body.ko_point) if body.ko_point else None
    try:
        captured = b.play(color, body.x, body.y)
    except IllegalMoveError as e:
        return {"legal": False, "error": str(e)}
    return {
        "legal": True,
        "grid": b.grid,
        "captured": [list(p) for p in captured],
        "ko_point": list(b.ko_point) if b.ko_point else None,
    }


class ScoreBody(BaseModel):
    size: int
    grid: List[List[int]]
    komi: float = 6.5


@app.post("/api/board/score")
def board_score(body: ScoreBody):
    b = Board(body.size)
    b.grid = body.grid
    return b.score(komi=body.komi)


# ---------------- 복기(kifu review) ----------------

class SgfParseBody(BaseModel):
    sgf_text: str


@app.post("/api/kifu/parse")
def kifu_parse(body: SgfParseBody):
    try:
        parsed = sgf_mod.parse_sgf(body.sgf_text)
    except Exception as e:
        raise HTTPException(400, f"SGF 파싱 실패: {e}")

    # 각 수마다의 보드 스냅샷을 서버(규칙 엔진)에서 미리 계산해 반환한다.
    b = Board(parsed["size"])
    b.set_stones(parsed["black_setup"], parsed["white_setup"])
    snapshots = [
        {"grid": [row[:] for row in b.grid], "captured": [], "move_no": 0, "comment": ""}
    ]
    for i, mv in enumerate(parsed["moves"]):
        color = BLACK if mv["color"] == "black" else WHITE
        captured = []
        if mv["x"] is not None:
            try:
                captured = b.play(color, mv["x"], mv["y"], enforce_ko=False)
            except IllegalMoveError:
                # 기보에 문제가 있어도 복기가 끊기지 않도록 스킵
                pass
        else:
            b.pass_move(color)
        snapshots.append({
            "grid": [row[:] for row in b.grid],
            "captured": [list(p) for p in captured],
            "move_no": i + 1,
            "color": mv["color"],
            "x": mv["x"], "y": mv["y"],
            "comment": mv.get("comment", ""),
        })

    return {"meta": parsed, "snapshots": snapshots}


class KifuSaveBody(BaseModel):
    title: str
    size: int
    moves: List[dict]  # {color, x, y, comment}
    komi: float = 6.5
    id: Optional[int] = None


@app.post("/api/kifu/save")
def kifu_save(body: KifuSaveBody):
    sgf_text = sgf_mod.build_sgf(body.size, body.moves, komi=body.komi, event=body.title)
    conn = db.get_conn()
    if body.id:
        conn.execute(
            "UPDATE kifu_reviews SET title=?, sgf_text=?, size=?, updated_at=? WHERE id=?",
            (body.title, sgf_text, body.size, db.now(), body.id),
        )
        review_id = body.id
    else:
        cur = conn.execute(
            "INSERT INTO kifu_reviews (title, sgf_text, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (body.title, sgf_text, body.size, db.now(), db.now()),
        )
        review_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": review_id, "sgf_text": sgf_text}


@app.get("/api/kifu/list")
def kifu_list():
    conn = db.get_conn()
    rows = conn.execute("SELECT id, title, size, created_at, updated_at FROM kifu_reviews ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/kifu/{kifu_id}")
def kifu_get(kifu_id: int):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM kifu_reviews WHERE id=?", (kifu_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "찾을 수 없습니다")
    return dict(row)


@app.delete("/api/kifu/{kifu_id}")
def kifu_delete(kifu_id: int):
    conn = db.get_conn()
    conn.execute("DELETE FROM kifu_reviews WHERE id=?", (kifu_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/kifu/{kifu_id}/download", response_class=PlainTextResponse)
def kifu_download(kifu_id: int):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM kifu_reviews WHERE id=?", (kifu_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "찾을 수 없습니다")
    return row["sgf_text"]


# ---------------- 급수전(랭크 대국) ----------------

RANK_GAMES = {}  # game_id -> in-memory 대국 상태 (서버 재시작 시 소멸, 단일 사용자 로컬 앱이므로 충분)


def _ranks_data():
    return load_json("ranks.json")["ranks"]


def _max_rank_index():
    return len(_ranks_data()) - 1


def _rank_row():
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM rank_state WHERE id=1").fetchone()
    conn.close()
    return dict(row)


@app.get("/api/rank/ranks")
def rank_ranks():
    return load_json("ranks.json")


@app.get("/api/rank/state")
def rank_state():
    row = _rank_row()
    ranks = _ranks_data()
    row["rank_label"] = ranks[row["rank_index"]]["label"]
    row["is_max"] = row["rank_index"] >= _max_rank_index()
    return row


class RankGameStartBody(BaseModel):
    size: int = 9
    komi: float = 6.5


@app.post("/api/rank/game/start")
def rank_game_start(body: RankGameStartBody):
    row = _rank_row()
    rank_index = row["rank_index"]
    ranks = _ranks_data()
    game_id = str(uuid.uuid4())
    RANK_GAMES[game_id] = {
        "size": body.size,
        "grid": [[0] * body.size for _ in range(body.size)],
        "ko_point": None,
        "komi": body.komi,
        "rank_index": rank_index,
        "pass_count": 0,
        "finished": False,
        "last_move": None,
        "captured_black": 0,
        "captured_white": 0,
    }
    return {
        "game_id": game_id,
        "size": body.size,
        "rank_index": rank_index,
        "rank_label": ranks[rank_index]["label"],
        "strength": round(bot_mod.strength_for_rank(rank_index, _max_rank_index()), 2),
        "grid": RANK_GAMES[game_id]["grid"],
        "user_color": "black",
        "bot_color": "white",
    }


def _get_game(game_id):
    game = RANK_GAMES.get(game_id)
    if not game:
        raise HTTPException(404, "진행 중인 대국을 찾을 수 없습니다. 새로 시작해주세요.")
    if game["finished"]:
        raise HTTPException(400, "이미 종료된 대국입니다.")
    return game


def _apply_bot_turn(game):
    strength = bot_mod.strength_for_rank(game["rank_index"], _max_rank_index())
    move = bot_mod.choose_move(game["size"], game["grid"], WHITE, game["ko_point"], strength)
    if move is None:
        game["pass_count"] += 1
        return {"passed": True}
    x, y = move
    board = Board(game["size"])
    board.grid = game["grid"]
    board.ko_point = tuple(game["ko_point"]) if game["ko_point"] else None
    try:
        captured = board.play(WHITE, x, y, enforce_ko=True)
    except IllegalMoveError:
        # 방어적 처리: 봇이 실수로 불법수를 골랐다면 그냥 패스 처리
        game["pass_count"] += 1
        return {"passed": True}
    game["grid"] = board.grid
    game["ko_point"] = board.ko_point
    game["pass_count"] = 0
    game["captured_white"] += len(captured)
    game["last_move"] = {"color": "white", "x": x, "y": y}
    return {"passed": False, "x": x, "y": y, "captured": [list(p) for p in captured]}


def _finalize_game(game, game_id):
    b = Board(game["size"])
    b.grid = game["grid"]
    result = b.score(komi=game["komi"])
    game["finished"] = True
    won = result["winner"] == "black"  # 사용자는 항상 흑
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM rank_state WHERE id=1").fetchone()
    rank_index = row["rank_index"]
    if won:
        rank_index = min(rank_index + 1, _max_rank_index())
        conn.execute(
            "UPDATE rank_state SET rank_index=?, wins=wins+1, updated_at=? WHERE id=1",
            (rank_index, db.now()),
        )
    else:
        conn.execute("UPDATE rank_state SET losses=losses+1, updated_at=? WHERE id=1", (db.now(),))
    conn.execute(
        "INSERT INTO rank_game_log (rank_index, size, result, black_total, white_total, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (game["rank_index"], game["size"], "win" if won else "loss", result["black_total"], result["white_total"], db.now()),
    )
    conn.commit()
    conn.close()
    ranks = _ranks_data()
    result["user_won"] = won
    result["new_rank_index"] = rank_index
    result["new_rank_label"] = ranks[rank_index]["label"]
    result["promoted"] = won and rank_index != game["rank_index"]
    return result


class RankMoveBody(BaseModel):
    game_id: str
    x: int
    y: int


@app.post("/api/rank/game/move")
def rank_game_move(body: RankMoveBody):
    game = _get_game(body.game_id)
    board = Board(game["size"])
    board.grid = game["grid"]
    board.ko_point = tuple(game["ko_point"]) if game["ko_point"] else None
    try:
        captured = board.play(BLACK, body.x, body.y, enforce_ko=True)
    except IllegalMoveError as e:
        raise HTTPException(400, str(e))
    game["grid"] = board.grid
    game["ko_point"] = board.ko_point
    game["pass_count"] = 0
    game["captured_black"] += len(captured)
    game["last_move"] = {"color": "black", "x": body.x, "y": body.y}

    bot_result = _apply_bot_turn(game)

    response = {
        "grid": game["grid"],
        "user_captured": [list(p) for p in captured],
        "bot_result": bot_result,
        "finished": False,
    }
    if game["pass_count"] >= 2:
        response["finished"] = True
        response["score"] = _finalize_game(game, body.game_id)
    return response


class RankPassBody(BaseModel):
    game_id: str


@app.post("/api/rank/game/pass")
def rank_game_pass(body: RankPassBody):
    game = _get_game(body.game_id)
    game["pass_count"] += 1
    response = {"finished": False, "bot_result": None}
    if game["pass_count"] < 2:
        bot_result = _apply_bot_turn(game)
        response["bot_result"] = bot_result
        response["grid"] = game["grid"]
    if game["pass_count"] >= 2:
        response["finished"] = True
        response["grid"] = game["grid"]
        response["score"] = _finalize_game(game, body.game_id)
    return response


class RankResignBody(BaseModel):
    game_id: str


@app.post("/api/rank/game/resign")
def rank_game_resign(body: RankResignBody):
    game = _get_game(body.game_id)
    game["finished"] = True
    conn = db.get_conn()
    conn.execute("UPDATE rank_state SET losses=losses+1, updated_at=? WHERE id=1", (db.now(),))
    row = conn.execute("SELECT * FROM rank_state WHERE id=1").fetchone()
    conn.execute(
        "INSERT INTO rank_game_log (rank_index, size, result, black_total, white_total, created_at) VALUES (?, ?, 'resign', NULL, NULL, ?)",
        (game["rank_index"], game["size"], db.now()),
    )
    conn.commit()
    conn.close()
    ranks = _ranks_data()
    return {"user_won": False, "new_rank_index": row["rank_index"], "new_rank_label": ranks[row["rank_index"]]["label"], "promoted": False}


class RankScoreNowBody(BaseModel):
    game_id: str


@app.post("/api/rank/game/score_now")
def rank_game_score_now(body: RankScoreNowBody):
    """바둑돌이 놓인 상태 그대로 지금 바로 계가를 확정한다 (양측이 더 둘 곳이 없다고 합의한 상황을 가정)."""
    game = _get_game(body.game_id)
    score = _finalize_game(game, body.game_id)
    return {"finished": True, "grid": game["grid"], "score": score}


@app.get("/api/rank/game/{game_id}")
def rank_game_get(game_id: str):
    game = RANK_GAMES.get(game_id)
    if not game:
        raise HTTPException(404, "찾을 수 없습니다")
    return game
