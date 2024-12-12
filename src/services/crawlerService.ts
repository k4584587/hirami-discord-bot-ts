//src/services/crawlerService.ts
import puppeteer from 'puppeteer';
import {
	PrismaClient
} from "@prisma/client";

const prisma = new PrismaClient();

export async function fetchContentUsingXPath(url: string, xpath: string): Promise<string | null> {
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	const page = await browser.newPage();
	await page.setUserAgent(
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
	);

	try {
		await page.goto(url, { waitUntil: 'networkidle2' });

		// XPath로 요소 찾기
		const elementHandle = await page.evaluateHandle((xpath) => {
			const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
			return result.singleNodeValue;
		}, xpath);

		let content = null;

		if (elementHandle) {
			content = await page.evaluate(el => el ? el.textContent : null, elementHandle); // el이 null이 아닌 경우에만 textContent 가져오기
			await elementHandle.dispose(); // 메모리 누수 방지
		}

		return content;
	} catch (error) {
		console.error("Error fetching content:", error);
		return null;
	} finally {
		await browser.close();
	}
}

export async function createCrawlingSite(data: {
  name: string;
  url: string;
  xpath: string;
  assistantName: string;
  interval: number;
  isActive: boolean;
}) {
  try {
	return await prisma.crawlingSite.create({
	  data,
	});
  } catch (error) {
	console.error('createCrawlingSite 서비스 에러:', error);
	throw new Error('CrawlingSite 생성에 실패했습니다.');
  }
}

export async function getCrawlingSites() {
  try {
	return await prisma.crawlingSite.findMany();
  } catch (error) {
	console.error('getCrawlingSites 서비스 에러:', error);
	throw new Error('CrawlingSite 조회에 실패했습니다.');
  }
}

export async function deleteCrawlingSite(id: number) {
  try {
	await prisma.crawlingSite.delete({
	  where: { id },
	});
  } catch (error) {
	console.error('deleteCrawlingSite 서비스 에러:', error);
	throw new Error('CrawlingSite 삭제에 실패했습니다.');
  }
}