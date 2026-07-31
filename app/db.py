import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS lesson_progress (
            lesson_id TEXT PRIMARY KEY,
            completed INTEGER DEFAULT 0,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS tsumego_progress (
            puzzle_id TEXT PRIMARY KEY,
            solved INTEGER DEFAULT 0,
            attempts INTEGER DEFAULT 0,
            last_result TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS kifu_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            sgf_text TEXT NOT NULL,
            size INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rank_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            rank_index INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS rank_game_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rank_index INTEGER NOT NULL,
            size INTEGER NOT NULL,
            result TEXT NOT NULL,
            black_total REAL,
            white_total REAL,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.execute("INSERT OR IGNORE INTO rank_state (id, rank_index, wins, losses) VALUES (1, 0, 0, 0)")
    conn.commit()
    conn.close()


def now():
    return datetime.now().isoformat(timespec="seconds")
