import {executeScheduledCrawling} from "../controllers/scheduleCrawlingController";
import {Router} from "express";

const router = Router();


/**
 * @swagger
 * /api/schedule-crawling:
 *   post:
 *     tags:
 *       - Scheduler
 *     summary: 조건에 맞는 사이트 크롤링 스케줄 실행
 *     description: 활성화된 사이트 중, 크롤링 주기에 맞는 사이트들을 조회하여 크롤링 작업을 실행합니다.
 *     responses:
 *       200:
 *         description: 스케줄 크롤링 실행 결과 반환
 *       500:
 *         description: 서버 오류
 */
router.post('/schedule-crawling', executeScheduledCrawling);

export default router;
