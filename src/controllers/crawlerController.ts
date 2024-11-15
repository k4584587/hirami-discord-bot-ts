import { Request, Response } from 'express';
import { fetchContentUsingXPath } from '../services/crawlerService';
import { generateGPTReply } from '../services/chatgptService';

export async function getContent(req: Request, res: Response) {
    console.log('getContent called');
    const { assistantName , url , xpath } = req.body;

    try {
        const content = await fetchContentUsingXPath(url, xpath);
        console.log(content)

        // GPT 응답 생성
        const reply = await generateGPTReply(String(2), "api", " " + content + " ", assistantName, "json");

        // 'json' 형식일 때 JSON 객체로 응답
        try {
            const jsonResponse = JSON.parse(reply);
            res.json(jsonResponse);
        } catch (parseError) {
            console.error('JSON 파싱 오류:', parseError);
            res.status(500).json({ error: 'GPT 응답을 파싱하는 데 실패했습니다.' });
        }

    } catch (error) {
        console.error('getContent 에러:', error);
        res.status(500).json({ error: 'Failed to fetch content.' });
    }
}
