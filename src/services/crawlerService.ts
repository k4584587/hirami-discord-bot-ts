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

/**
 * CrawlingSite 업데이트 서비스
 */
export async function updateCrawlingSite(id: number, data: {
  name?: string;
  url?: string;
  xpath?: string;
  assistantName?: string;
  interval?: number;
  isActive?: boolean;
  lastCrawled?: Date | null;
}) {
  try {
    return await prisma.crawlingSite.update({
      where: { id },
      data,
    });
  } catch (error) {
    console.error('updateCrawlingSite 서비스 에러:', error);
    throw new Error('CrawlingSite 업데이트에 실패했습니다.');
  }
}


interface Post {
  id: number;
  category: string;
  title: string;
  author: string;
  date: string;
  views: number;
  comments: number;
  likes: number;
}

interface CrawlingDataStructure {
  [key: string]: any;
  metadata: {
    [key: string]: any;
    crawledAt: string;
    url: string;
    status: 'success' | 'error';
    totalPosts: number;
    lastUpdated: string;
  };
  data: {
    posts: Post[];
    summary?: {
      totalViews: number;
      avgComments: number;
      mostActiveAuthor: string;
      categories: { [key: string]: number };
    };
  };
}

export async function saveCrawlingData(crawlingSiteId: number, data: {
  processedData: any;
  crawledAt: Date;
}) {
  try {
    const posts = data.processedData.posts || [];

    // 각 게시글에 게시판 주소(boardUrl) 추가
    const updatedPosts = posts.map((post: Post) => ({
      ...post,
      boardUrl: `https://gall.dcinside.com/mgallery/board/view/?id=vr&no=${post.id}`
    }));

    // 통계 데이터 계산
    const totalViews = updatedPosts.reduce((sum: number, post: Post) => sum + post.views, 0);
    const avgComments = updatedPosts.reduce((sum: number, post: Post) => sum + post.comments, 0) / updatedPosts.length;

    // 가장 활동적인 작성자 찾기
    const authorCounts = updatedPosts.reduce((acc: { [key: string]: number }, post: Post) => {
      acc[post.author] = (acc[post.author] || 0) + 1;
      return acc;
    }, {});
    const mostActiveAuthor = Object.entries(authorCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || '';

    // 카테고리별 게시글 수 집계
    const categories = updatedPosts.reduce((acc: { [key: string]: number }, post: Post) => {
      acc[post.category] = (acc[post.category] || 0) + 1;
      return acc;
    }, {});

    const structuredData: CrawlingDataStructure = {
      metadata: {
        crawledAt: data.crawledAt.toISOString(),
        lastUpdated: new Date().toISOString(),
        status: updatedPosts.length > 0 ? 'success' : 'error',
        url: data.processedData.url || '',
        totalPosts: updatedPosts.length
      },
      data: {
        posts: updatedPosts.sort((a: Post, b: Post) => b.id - a.id),
        summary: {
          totalViews,
          avgComments,
          mostActiveAuthor,
          categories
        }
      }
    };

    return await prisma.crawlingData.create({
      data: {
        crawlingSiteId,
        crawlingSiteData: structuredData,
      },
    });
  } catch (error) {
    console.error('saveCrawlingData 서비스 에러:', error);
    throw new Error('크롤링 데이터 저장에 실패했습니다.');
  }
}


export async function getCrawlingData(crawlingSiteId?: number) {
  try {
    const data = await prisma.crawlingData.findMany({
      where: crawlingSiteId ? { crawlingSiteId } : undefined,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        crawlingSite: {
          select: {
            name: true,
            url: true,
            assistantName: true
          }
        }
      }
    });

    // BigInt를 문자열로 변환
    return data.map(item => ({
      ...item,
      id: String(item.id),  // BigInt를 string으로 변환
      crawlingSiteId: Number(item.crawlingSiteId)  // BigInt를 number로 변환
    }));
  } catch (error) {
    console.error('getCrawlingData 서비스 에러:', error);
    throw new Error('크롤링 데이터 조회에 실패했습니다.');
  }
}