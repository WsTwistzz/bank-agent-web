"""Extensible deterministic replies for small conversational scenes."""

import re
from dataclasses import dataclass
from typing import Callable


GREETING_RESPONSE = (
    "你好，我是 Bank Agent，可以帮你查询账户、余额和流水，管理转账、银行卡、"
    "代扣与理财业务。涉及资金或账户变更时，我会先复述关键信息并要求你明确确认。"
)


def _compact(text):
    return re.sub(r"[\s，,。.!！?？、；;：:~～]+", "", text.strip().lower())


@dataclass(frozen=True)
class ConversationScene:
    name: str
    matches: Callable[[str], bool]
    response: str


SCENES = (
    ConversationScene(
        name="greeting",
        matches=lambda text: _compact(text) in {
            "你好", "您好", "嗨", "哈喽", "hello", "hi", "hey",
            "早上好", "上午好", "下午好", "晚上好",
        },
        response=GREETING_RESPONSE,
    ),
)


def match_conversation_scene(text):
    """Return the first matching scene; append to SCENES to extend behavior."""
    return next((scene for scene in SCENES if scene.matches(text)), None)
