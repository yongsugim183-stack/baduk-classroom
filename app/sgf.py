"""아주 단순한 SGF(Smart Game Format) 파서/작성기.
분기(변화도)는 첫 번째 메인 라인만 지원한다 (복기 기본 기능에 충분)."""
import re

COORD = "abcdefghijklmnopqrstuvwxyz"


def sgf_to_xy(code):
    if not code or len(code) != 2:
        return None
    x = COORD.index(code[0])
    y = COORD.index(code[1])
    return x, y


def xy_to_sgf(x, y):
    return COORD[x] + COORD[y]


def _split_properties(node_text):
    """'B[pd]C[설명]' 같은 노드 텍스트를 {PROP: [values]} 로 변환."""
    props = {}
    for m in re.finditer(r"([A-Z]{1,2})((?:\[[^\]]*\])+)", node_text):
        key = m.group(1)
        values = re.findall(r"\[([^\]]*)\]", m.group(2))
        props[key] = values
    return props


def parse_sgf(text):
    """SGF 텍스트를 파싱해 {size, komi, handicap_black, handicap_white, moves:[{color,x,y,comment}]} 반환.
    메인 라인만 따라가고 첫 분기(variation)는 무시한다."""
    text = text.strip()
    if text.startswith("(") and text.endswith(")"):
        text = text[1:-1]
    # 최상위에서 중첩 분기 '(' 는 첫 서브트리만 취하고 나머지는 버린다
    depth = 0
    main_chars = []
    i = 0
    branch_started = False
    while i < len(text):
        ch = text[i]
        if ch == "(":
            if not branch_started:
                branch_started = True
                depth = 1
                i += 1
                continue
            else:
                depth += 1
        elif ch == ")":
            if branch_started:
                depth -= 1
                if depth == 0:
                    i += 1
                    break
        if branch_started:
            if depth == 1:
                main_chars.append(ch)
        else:
            main_chars.append(ch)
        i += 1
    main_text = "".join(main_chars)

    nodes = [n for n in main_text.split(";") if n.strip()]
    result = {
        "size": 19,
        "komi": 6.5,
        "black_setup": [],
        "white_setup": [],
        "moves": [],
        "player_black": "",
        "player_white": "",
        "event": "",
    }
    for node in nodes:
        props = _split_properties(node)
        if "SZ" in props:
            try:
                result["size"] = int(props["SZ"][0])
            except ValueError:
                pass
        if "KM" in props:
            try:
                result["komi"] = float(props["KM"][0])
            except ValueError:
                pass
        if "PB" in props:
            result["player_black"] = props["PB"][0]
        if "PW" in props:
            result["player_white"] = props["PW"][0]
        if "EV" in props:
            result["event"] = props["EV"][0]
        if "AB" in props:
            for v in props["AB"]:
                xy = sgf_to_xy(v)
                if xy:
                    result["black_setup"].append(xy)
        if "AW" in props:
            for v in props["AW"]:
                xy = sgf_to_xy(v)
                if xy:
                    result["white_setup"].append(xy)
        comment = props.get("C", [""])[0] if "C" in props else ""
        if "B" in props:
            v = props["B"][0]
            xy = sgf_to_xy(v) if v else None
            result["moves"].append({"color": "black", "x": xy[0] if xy else None,
                                     "y": xy[1] if xy else None, "comment": comment})
        elif "W" in props:
            v = props["W"][0]
            xy = sgf_to_xy(v) if v else None
            result["moves"].append({"color": "white", "x": xy[0] if xy else None,
                                     "y": xy[1] if xy else None, "comment": comment})
        elif comment and result["moves"]:
            result["moves"][-1]["comment"] = comment
    return result


def build_sgf(size, moves, komi=6.5, player_black="흑", player_white="백", event="복기"):
    """moves: [{color, x, y, comment}] -> SGF 문자열."""
    parts = [f"(;GM[1]FF[4]SZ[{size}]KM[{komi}]PB[{player_black}]PW[{player_white}]EV[{event}]"]
    for m in moves:
        tag = "B" if m["color"] == "black" else "W"
        if m.get("x") is None:
            coord = ""
        else:
            coord = xy_to_sgf(m["x"], m["y"])
        node = f";{tag}[{coord}]"
        if m.get("comment"):
            escaped = m["comment"].replace("\\", "\\\\").replace("]", "\\]")
            node += f"C[{escaped}]"
        parts.append(node)
    parts.append(")")
    return "".join(parts)
