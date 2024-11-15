import { Router } from 'express';
import { getContent } from '../controllers/crawlerController';

const router = Router();

router.post('/crawl', getContent);

export default router;
