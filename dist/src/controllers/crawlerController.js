"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContent = getContent;
const crawlerService_1 = require("../services/crawlerService");
const chatgptService_1 = require("../services/chatgptService");
async function getContent(req, res) {
    console.log('getContent called');
    const { assistantName, url, xpath } = req.body;
    try {
        const content = await (0, crawlerService_1.fetchContentUsingXPath)(url, xpath);
        // GPT 응답 생성
        const reply = await (0, chatgptService_1.generateGPTReply)(String(2), "api", " " + content + " ", assistantName, "json");
        console.log(reply);
        // 'json' 형식일 때 JSON 객체로 응답
        try {
            const jsonResponse = JSON.parse(reply);
            res.json(jsonResponse);
        }
        catch (parseError) {
            console.error('JSON 파싱 오류:', parseError);
            res.status(500).json({ error: 'GPT 응답을 파싱하는 데 실패했습니다.' });
        }
    }
    catch (error) {
        console.error('getContent 에러:', error);
        res.status(500).json({ error: 'Failed to fetch content.' });
    }
}
