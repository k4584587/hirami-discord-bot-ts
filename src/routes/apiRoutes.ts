import { Router } from 'express';
import {
	checkAdminAccount,
	createAdminController
} from '../controllers/adminController';
import { getContent } from '../controllers/crawlerController';

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
 * /api/admin/check:
 *   get:
 *     tags:
 *       - Admin
 *     summary: 관리자 권한 확인
 *     description: 디스코드 ID를 기반으로 관리자 권한을 확인합니다
 *     parameters:
 *       - in: query
 *         name: discordId
 *         required: true
 *         schema:
 *           type: string
 *         description: 확인할 사용자의 디스코드 ID
 *         example: "123456789"
 *     responses:
 *       200:
 *         description: 확인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isAdmin:
 *                   type: boolean
 *                   example: true
 *                 role:
 *                   type: string
 *                   example: "ADMIN"
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
router.post('/checkAdminAccount', checkAdminAccount);

/**
 * @swagger
 * /api/admin/create:
 *   post:
 *     tags:
 *       - Admin
 *     summary: 관리자 생성
 *     description: 새로운 관리자를 생성합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: 디스코드 ID
 *               username:
 *                 type: string
 *                 description: 디스코드 사용자 이름
 *     responses:
 *       201:
 *         description: 관리자 생성 성공
 *       500:
 *         description: 서버 오류
 */
router.post('/admin/create', createAdminController); // 새로운 라우터 추가

export default router;
