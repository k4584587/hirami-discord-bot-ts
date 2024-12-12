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

		return {
			isAdmin: admin.isActive,
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
		email: adminData.email,
		avatar: adminData.avatar,
		isActive: true,
		role: 'USER',
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