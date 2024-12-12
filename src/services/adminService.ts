import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function checkAdminStatus(discordId: string) {
	try {
		const admin = await prisma.nbAdmins.findUnique({
			where: {
				discordId: discordId,
			},
			select: {
				isActive: true,
				role: true,
			},
		});

		if (!admin) {
			return {
				isAdmin: false,
				role: null
			};
		}

		// role에 따라 isAdmin 값 설정
		const isAdmin = admin.role === 'ADMIN' ? true : false;

		return {
			isAdmin: isAdmin,
			role: admin.role
		};

	} catch (error) {
		console.error('관리자 상태 확인 중 오류:', error);
		throw error;
	}
}

export async function createAdmin(adminData: any) {
  try {
	const existingAdmin = await prisma.nbAdmins.findUnique({
	  where: { discordId: adminData.id },
	});

	if (existingAdmin) {
	  return { result_code: "101", result_message: "사용자 등록 중복" };
	}

	const newAdmin = await prisma.nbAdmins.create({
	data: {
		discordId: adminData.id,
		username: adminData.username,
		globalName: adminData.global_name,
		email: adminData.email,
		avatar: adminData.avatar,
		isActive: true,
		role: 'USER', //기본값 USER 사용자로 생성 관리자가 승인을 해야 ADMIN 으로 바꿔야됨
	  },
	});

	// BigInt 값을 문자열로 변환
	const admin = {
	  ...newAdmin,
	  id: newAdmin.id.toString(),
	};

	return admin;
  } catch (error) {
	console.error('관리자 생성 중 오류 발생:', error);
	throw error; // 에러를 컨트롤러로 전달
  }
}