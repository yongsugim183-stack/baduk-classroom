"""바둑 규칙 엔진: 착수, 따내기(capture), 패(ko), 간단 집계산."""
from copy import deepcopy

EMPTY, BLACK, WHITE = 0, 1, 2


def other(color):
    return WHITE if color == BLACK else BLACK


class IllegalMoveError(Exception):
    pass


class Board:
    def __init__(self, size=19):
        self.size = size
        self.grid = [[EMPTY] * size for _ in range(size)]
        self.history = []  # list of (color, x, y or None for pass)
        self.captured = {BLACK: 0, WHITE: 0}  # 각 색이 "따낸" 돌 수
        self._prev_grid_snapshot = None  # 단순 패 검출용 (직전 국면)
        self.ko_point = None

    def in_bounds(self, x, y):
        return 0 <= x < self.size and 0 <= y < self.size

    def neighbors(self, x, y):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if self.in_bounds(nx, ny):
                yield nx, ny

    def get_group(self, x, y):
        color = self.grid[x][y]
        if color == EMPTY:
            return set(), set()
        stack = [(x, y)]
        group = set()
        liberties = set()
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in group:
                continue
            group.add((cx, cy))
            for nx, ny in self.neighbors(cx, cy):
                if self.grid[nx][ny] == EMPTY:
                    liberties.add((nx, ny))
                elif self.grid[nx][ny] == color and (nx, ny) not in group:
                    stack.append((nx, ny))
        return group, liberties

    def set_stones(self, black_points=(), white_points=()):
        """문제/기보 세팅용: 초기 배석."""
        for x, y in black_points:
            self.grid[x][y] = BLACK
        for x, y in white_points:
            self.grid[x][y] = WHITE

    def try_move(self, color, x, y, enforce_ko=True):
        """실제로 두지 않고 결과만 시뮬레이션. (legal, resulting_grid, captured_points) 반환."""
        if not self.in_bounds(x, y):
            raise IllegalMoveError("보드 범위를 벗어났습니다")
        if self.grid[x][y] != EMPTY:
            raise IllegalMoveError("이미 돌이 있는 자리입니다")

        trial = deepcopy(self.grid)
        trial[x][y] = color

        captured_points = []
        opp = other(color)
        for nx, ny in self.neighbors(x, y):
            if trial[nx][ny] == opp:
                group, libs = self._group_on(trial, nx, ny)
                if not libs:
                    for gx, gy in group:
                        trial[gx][gy] = EMPTY
                    captured_points.extend(group)

        group, libs = self._group_on(trial, x, y)
        if not libs:
            raise IllegalMoveError("자충(자살수)은 둘 수 없습니다")

        if enforce_ko and self.ko_point == (x, y) and len(captured_points) == 1:
            raise IllegalMoveError("패(꼬) 규칙 위반입니다")

        return trial, captured_points

    def _group_on(self, grid, x, y):
        color = grid[x][y]
        stack = [(x, y)]
        group = set()
        liberties = set()
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in group:
                continue
            group.add((cx, cy))
            for nx, ny in self.neighbors(cx, cy):
                if grid[nx][ny] == EMPTY:
                    liberties.add((nx, ny))
                elif grid[nx][ny] == color and (nx, ny) not in group:
                    stack.append((nx, ny))
        return group, liberties

    def play(self, color, x, y, enforce_ko=True):
        trial, captured = self.try_move(color, x, y, enforce_ko=enforce_ko)
        self.grid = trial
        self.captured[color] += len(captured)
        # 패 갱신: 단 1점 따낸 경우에만 다음 상대의 되따내기를 금지
        if len(captured) == 1:
            self.ko_point = captured[0]
        else:
            self.ko_point = None
        self.history.append((color, x, y))
        return captured

    def pass_move(self, color):
        self.history.append((color, None, None))
        self.ko_point = None

    def copy(self):
        b = Board(self.size)
        b.grid = deepcopy(self.grid)
        b.history = list(self.history)
        b.captured = dict(self.captured)
        b.ko_point = self.ko_point
        return b

    def to_list(self):
        return self.grid

    # --- 간단 지역(area) 집계산: Tromp-Taylor 방식 ---
    def score(self, komi=6.5):
        visited = [[False] * self.size for _ in range(self.size)]
        territory = {BLACK: 0, WHITE: 0}
        stones = {BLACK: 0, WHITE: 0}
        for x in range(self.size):
            for y in range(self.size):
                if self.grid[x][y] != EMPTY:
                    stones[self.grid[x][y]] += 1
                    continue
                if visited[x][y]:
                    continue
                stack = [(x, y)]
                region = []
                borders = set()
                visited[x][y] = True
                while stack:
                    cx, cy = stack.pop()
                    region.append((cx, cy))
                    for nx, ny in self.neighbors(cx, cy):
                        if self.grid[nx][ny] == EMPTY:
                            if not visited[nx][ny]:
                                visited[nx][ny] = True
                                stack.append((nx, ny))
                        else:
                            borders.add(self.grid[nx][ny])
                if borders == {BLACK}:
                    territory[BLACK] += len(region)
                elif borders == {WHITE}:
                    territory[WHITE] += len(region)
        black_total = stones[BLACK] + territory[BLACK]
        white_total = stones[WHITE] + territory[WHITE] + komi
        return {
            "black_stones": stones[BLACK],
            "white_stones": stones[WHITE],
            "black_territory": territory[BLACK],
            "white_territory": territory[WHITE],
            "black_total": black_total,
            "white_total": white_total,
            "winner": "black" if black_total > white_total else "white",
            "diff": round(abs(black_total - white_total), 1),
        }
