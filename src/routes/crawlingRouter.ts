//src/routes/adminRouter.ts
import { Router } from 'express';
import {
	createCrawlingSiteController,
	deleteCrawlingSiteController,
	getContent,
	getCrawlingSitesController,
	updateCrawlingSiteController,
} from '../controllers/crawlerController';

const router = Router();

/**
 * @swagger
 * /api/crawl:
 *   post:
 *     tags:
 *       - Crawler
 *     summary: 웹사이트 크롤링
 *     description: 지정된 URL에서 XPath를 사용하여 콘텐츠를 크롤링하고 GPT 응답을 반환합니다
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - xpath
 *               - assistantName
 *             properties:
 *               url:
 *                 type: string
 *                 description: 크롤링할 웹사이트 URL
 *                 example: "https://example.com"
 *               xpath:
 *                 type: string
 *                 description: 추출할 콘텐츠의 XPath
 *                 example: "//div[@class='content']"
 *               assistantName:
 *                 type: string
 *                 description: GPT 응답 생성에 사용될 어시스턴트 이름
 *                 example: "assistant"
 *     responses:
 *       200:
 *         description: 크롤링 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: GPT가 생성한 JSON 응답
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.post('/crawl', getContent);


/**
 * @swagger
 * /api/crawling-sites/{id}:
 *   put:
 *     tags:
 *       - CrawlingSite
 *     summary: CrawlingSite 수정
 *     description: ID를 기반으로 CrawlingSite 정보를 수정합니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 수정할 CrawlingSite의 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 사이트명
 *                 example: "네이버 카페"
 *               url:
 *                 type: string
 *                 description: 사이트 URL
 *                 example: "https://example.com"
 *               xpath:
 *                 type: string
 *                 description: 콘텐츠를 추출할 XPath
 *                 example: "//div[@class='content']"
 *               assistantName:
 *                 type: string
 *                 description: 크롤링 담당 Assistant 이름
 *                 example: "assistant"
 *               interval:
 *                 type: integer
 *                 description: 크롤링 주기 (분)
 *                 example: 10
 *               isActive:
 *                 type: boolean
 *                 description: 사이트 활성화 여부
 *                 example: true
 *     responses:
 *       200:
 *         description: CrawlingSite 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CrawlingSite'
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
 // @ts-ignore
router.put('/crawling-sites/:id', updateCrawlingSiteController);


/**
 * @swagger
 * /api/crawling-sites:
 *   post:
 *     tags:
 *       - CrawlingSite
 *     summary: CrawlingSite 생성
 *     description: 새로운 CrawlingSite 를 생성합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               xpath:
 *                 type: string
 *               assistantName:
 *                 type: string
 *               interval:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: CrawlingSite 생성 성공
 *       500:
 *         description: 서버 오류
 */
router.post('/crawling-sites', createCrawlingSiteController);


/**
 * @swagger
 * /api/crawling-sites:
 *   get:
 *     tags:
 *       - CrawlingSite
 *     summary: CrawlingSite 목록 조회
 *     description: 모든 CrawlingSite 목록을 조회합니다.
 *     responses:
 *       200:
 *         description: 조회 성공
 *       500:
 *         description: 서버 오류
 */
router.get('/crawling-sites', getCrawlingSitesController);

/**
 * @swagger
 * /api/crawling-sites/{id}:
 *   delete:
 *     tags:
 *       - CrawlingSite
 *     summary: CrawlingSite 삭제
 *     description: ID를 기반으로 CrawlingSite 를 삭제합니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 삭제할 CrawlingSite 의 ID
 *     responses:
 *       204:
 *         description: 삭제 성공
 *       500:
 *         description: 서버 오류
 */
router.delete('/crawling-sites/:id', deleteCrawlingSiteController);

export default router;
