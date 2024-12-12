import {
	NextFunction,
	Request,
	Response
} from 'express';
import {
	checkAdminStatus,
	createAdmin
} from '../services/adminService';

export async function checkAdminAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
	console.log('checkAdmin called');
	const discordId = req.query.discordId as string;

	try {
		if (!discordId) {
			res.status(400).json({ error: '유효한 디스코드 ID가 필요합니다.' });
			return;
		}

		const adminStatus = await checkAdminStatus(discordId);
		res.status(200).json(adminStatus);

	} catch (error) {
		console.error('관리자 확인 중 오류 발생:', error);
		res.status(500).json({ error: '서버 오류가 발생했습니다.' });
	}
}

export async function createAdminController(req: Request, res: Response) {
  try {
	const newAdmin = await createAdmin(req.body); // 서비스 함수 호출
	res.status(201).json(newAdmin);
  } catch (error) {
	console.error('관리자 생성 중 오류 발생:', error);
	res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}