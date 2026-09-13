import json


class ResultAggregator:
    def __init__(self, model, trace=None):
        self.model = model
        self.trace = trace

    def aggregate(self, results, user_message, user_id, session_id):
        assessment = {
            "sufficient": bool(results) and all(
                item.get("response") and not item.get("error") for item in results
            ),
            "failed_specialists": [
                item.get("specialist") for item in results if item.get("error")
            ],
            "conflict_review": "requested_from_aggregator_model" if len(results) > 1 else "not_needed",
        }
        self._trace(
            "aggregation_evaluated", user_id, session_id, assessment=assessment,
        )
        if len(results) == 1:
            return results[0].get("response") or self._error_response(results)
        usable = [result for result in results if result.get("response")]
        if not usable:
            return self._error_response(results)
        prompt = (
            "你是银行多专家结果汇总器。只根据专家结果回答，不调用工具、不编造数据。"
            "保留重要金额、状态和风险提示；判断信息是否充分，如果专家结论冲突，要明确指出。"
        )
        payload = json.dumps(results, ensure_ascii=False)
        self._trace(
            "aggregation_request", user_id, session_id,
            user_message=user_message, specialist_results=results,
        )
        reply = self.model.respond([
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_message},
            {"role": "user", "content": f"专家结果：{payload}"},
        ], [])
        response = reply.get("content", "").strip()
        if not response:
            response = "\n".join(
                f"{item['specialist']}：{item['response']}" for item in usable
            )
        self._trace(
            "aggregation_response", user_id, session_id, response=response,
        )
        return response

    @staticmethod
    def _error_response(results):
        errors = [item.get("error", "未知错误") for item in results]
        return "专家任务执行失败：" + "；".join(errors)

    def _trace(self, event, user_id, session_id, **details):
        if self.trace:
            self.trace.write(event, user_id, session_id, **details)
