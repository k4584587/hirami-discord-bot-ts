//src/controllers/crawlerController.ts
import { Request, Response } from 'express';
import {
	createCrawlingSite,
	deleteCrawlingSite,
	fetchContentUsingXPath,
	getCrawlingSites
} from '../services/crawlerService';
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

// CrawlingSite 생성
export async function createCrawlingSiteController(req: Request, res: Response) {
  try {
	const { name, url, xpath, assistantName, interval, isActive } = req.body;
	const newCrawlingSite = await createCrawlingSite({
	  name,
	  url,
	  xpath,
	  assistantName,
	  interval,
	  isActive,
	});
	res.status(201).json(newCrawlingSite);
  } catch (error: any) {
	res.status(500).json({ error: error.message });
  }
}

// CrawlingSite 조회
export async function getCrawlingSitesController(req: Request, res: Response) {
  try {
	const crawlingSites = await getCrawlingSites();
	res.json(crawlingSites);
  } catch (error: any) {
	res.status(500).json({ error: error.message });
  }
}

// CrawlingSite 삭제
export async function deleteCrawlingSiteController(req: Request, res: Response) {
  try {
	const { id } = req.params;
	await deleteCrawlingSite(parseInt(id));
	res.status(204).send();
  } catch (error: any) {
	res.status(500).json({ error: error.message });
  }
}