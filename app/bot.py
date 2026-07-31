"""휴리스틱 기반 바둑 대국 상대(봇).

전문 기사 수준의 인공지능이 아니라, 급수 체계를 흉내낸 '실력별 연습 상대'입니다.
strength(0.0~1.0)가 높을수록: 따내기/자충회피/자기 돌 살리기를 더 잘 인식하고,
수를 둘 때 무작위성(실수)이 줄어듭니다.
"""
import random
from app.go_engine import Board, IllegalMoveError, BLACK, WHITE, other


def strength_for_rank(rank_index, max_index):
    return 0.05 + 0.90 * (rank_index / max_index)


def _all_groups(grid, size, color):
    """color의 모든 집단을 (대표점, 활로수) 형태로 반환."""
    seen = set()
    groups = []
    b = Board(size)
    b.grid = grid
    for x in range(size):
        for y in range(size):
            if grid[x][y] == color and (x, y) not in seen:
                group, libs = b.get_group(x, y)
                seen |= group
                groups.append((group, libs))
    return groups


def choose_move(size, grid, color, ko_point, strength, rng=None):
    rng = rng or random.Random()
    board = Board(size)
    board.grid = [row[:] for row in grid]
    board.ko_point = tuple(ko_point) if ko_point else None
    opp = other(color)

    empties = [(x, y) for x in range(size) for y in range(size) if grid[x][y] == 0]
    if not empties:
        return None  # pass

    my_groups = _all_groups(grid, size, color)
    opp_groups = _all_groups(grid, size, opp)
    my_atari_liberty_points = set()
    for g, libs in my_groups:
        if len(libs) == 1:
            my_atari_liberty_points |= libs
    opp_atari_liberty_points = set()
    for g, libs in opp_groups:
        if len(libs) == 1:
            opp_atari_liberty_points |= libs

    scored = []
    for x, y in empties:
        try:
            trial, captured = board.try_move(color, x, y, enforce_ko=True)
        except IllegalMoveError:
            continue

        score = 0.0
        capture_n = len(captured)
        score += capture_n * 12

        # 이 수를 둔 뒤 내 돌의 활로 (자충 여부 확인)
        tmp = Board(size)
        tmp.grid = trial
        _, my_libs_after = tmp.get_group(x, y)
        is_self_atari = len(my_libs_after) <= 1 and capture_n == 0
        if is_self_atari:
            score -= 40

        if (x, y) in opp_atari_liberty_points and capture_n > 0:
            score += 10  # 상대 단수 돌을 실제로 따내는 수
        elif (x, y) in my_atari_liberty_points:
            # 내 단수 집단을 늘려서 살리는 수인지 확인
            if len(my_libs_after) > 1:
                score += 9

        # 상대 집단을 단수로 몰아넣는 수인지 (사전 스캔)
        for gx, gy in board.neighbors(x, y):
            if trial[gx][gy] == opp:
                tmp2 = Board(size)
                tmp2.grid = trial
                _, olibs = tmp2.get_group(gx, gy)
                if len(olibs) == 1:
                    score += 5
                    break

        # 근접성: 기존 돌 근처를 선호 (완전히 붙지는 않게 약간의 거리 선호)
        if empties and (my_groups or opp_groups):
            min_dist = min(
                abs(x - sx) + abs(y - sy)
                for gx_list, _ in (my_groups + opp_groups)
                for sx, sy in gx_list
            ) if (my_groups or opp_groups) else 99
            if min_dist == 0:
                pass
            elif min_dist <= 3:
                score += 3
            elif min_dist <= 6:
                score += 1.2

        # 초반 화점/3-3 근방 선호
        stone_count = sum(1 for r in grid for v in r if v != 0)
        if stone_count < 6:
            edge_dist = min(x, y, size - 1 - x, size - 1 - y)
            if 2 <= edge_dist <= 3:
                score += 2.5

        # 가장자리 1선은 약간 감점(초반)
        edge_dist2 = min(x, y, size - 1 - x, size - 1 - y)
        if edge_dist2 == 0 and stone_count < size * size * 0.6:
            score -= 1.5

        scored.append(((x, y), score))

    if not scored:
        return None  # 둘 곳이 없으면 패스

    scored.sort(key=lambda t: t[1], reverse=True)
    best_score = scored[0][1]

    # 남은 최선의 수가 명백히 손해뿐이라면(자충 등) 어느 정도 진행된 판에서는 패스
    stone_count = sum(1 for r in grid for v in r if v != 0)
    if best_score < -10 and stone_count > size * size * 0.35:
        return None

    # 확률적으로 완전 랜덤 실수 (강도가 낮을수록 자주)
    blunder_chance = max(0.0, (1 - strength) * 0.35)
    if rng.random() < blunder_chance:
        return rng.choice(empties) if empties else None

    # 후보 중 상위 N개에서 강도에 따라 얼마나 '최선'을 고수하는지 결정
    noise_scale = (1 - strength) * 18 + 1.5
    best = None
    best_total = -1e9
    top_k = scored[: max(3, int(len(scored) * (0.05 + (1 - strength) * 0.4)))]
    for (pt, sc) in top_k:
        total = sc + rng.uniform(0, noise_scale)
        if total > best_total:
            best_total = total
            best = pt
    return best
