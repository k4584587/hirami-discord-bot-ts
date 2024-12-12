import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { Run } from "openai/resources/beta/threads/runs/runs";
import logger from '../../logger'; // Winston 로거 임포트

dotenv.config();

// 커스텀 에러 클래스 정의
class GPTReplyError extends Error {
	status?: number;
	thread_id?: string;

	constructor(message: string, status?: number, thread_id?: string) {
	   super(message);
	   this.name = 'GPTReplyError';
	   this.status = status;
	   this.thread_id = thread_id;
	}
}

// 싱글톤 인스턴스 생성 및 초기화 검증
const prisma = new PrismaClient();

prisma.$connect()
	.then(() => logger.info('Prisma 데이터베이스 연결 성공'))
	.catch(error => {
	   logger.error('Prisma 데이터베이스 연결 오류:', error);
	   process.exit(1);
	});

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// 캐시를 위한 인메모리 저장소
const cachedAssistantIds: Record<string, string> = {};
const cachedAssistantSettings: Record<string, any> = {};
const cachedThreadMessages: Record<string, { role: string, content: string }[]> = {}; // Thread 메시지 캐싱

// 인터페이스 확장
interface RunExtended extends Run {
	thread_id: string;
}

/**
 * 어시스턴트 이름을 기반으로 어시스턴트 ID를 가져오고 캐싱합니다.
 */
const getAssistantId = async (name: string): Promise<string> => {
	logger.info(`${name}에 대한 assistantId를 가져옵니다.`);

	if (cachedAssistantIds[name]) {
	   logger.info(`${name}에 대한 캐시된 assistantId를 찾았습니다: ${cachedAssistantIds[name]}`);
	   return cachedAssistantIds[name];
	}

	const assistant = await prisma.nbAssistants.findFirst({
	   where: { name },
	   select: { assistantId: true },
	});

	if (!assistant?.assistantId) {
	   logger.error(`${name}에 대한 assistantId를 데이터베이스에서 찾을 수 없습니다.`);
	   throw new GPTReplyError(`데이터베이스에서 이름이 '${name}'인 유효한 assistantId를 찾을 수 없습니다.`);
	}

	cachedAssistantIds[name] = assistant.assistantId;
	logger.info(`${name}에 대한 assistantId를 캐싱했습니다: ${assistant.assistantId}`);
	return assistant.assistantId;
};

/**
 * 어시스턴트 ID를 기반으로 어시스턴트 설정을 가져오고 캐싱합니다.
 */
const getAssistantSettings = async (assistantId: string): Promise<any> => {
	logger.info(`${assistantId}에 대한 어시스턴트 설정을 가져옵니다.`);

	if (cachedAssistantSettings[assistantId]) {
	   logger.info(`${assistantId}에 대한 캐시된 어시스턴트 설정을 찾았습니다.`);
	   return cachedAssistantSettings[assistantId];
	}

	try {
	   const assistantSettings = await openai.beta.assistants.retrieve(assistantId);
	   cachedAssistantSettings[assistantId] = assistantSettings;
	   logger.info(`${assistantId}에 대한 어시스턴트 설정을 캐싱했습니다.`);
	   return assistantSettings;
	} catch (error) {
	   logger.error(`${assistantId} 어시스턴트 설정을 가져오는 중 오류가 발생했습니다:`, error);
	   throw new GPTReplyError('어시스턴트 설정을 가져오는 중 오류가 발생했습니다.');
	}
};

/**
 * 타임아웃을 사용하지 않고 OpenAI 실행이 완료되었는지 재귀적으로 확인합니다.
 */
const checkRunCompletion = async (
	threadId: string,
	runId: string
): Promise<void> => {
	logger.info(`실행 완료 확인 중: threadId=${threadId}, runId=${runId}`);

	let run: Run | undefined;

	try {
	   run = await openai.beta.threads.runs.retrieve(threadId, runId);
	} catch (error) {
	   logger.error('실행 상태 확인 중 오류 발생:', error);
	   throw new GPTReplyError('실행(run) 상태를 확인하는 중 오류가 발생했습니다.', undefined, threadId);
	}

	logger.info(`실행 상태: ${run.status}`);

	if (run.status === 'completed') {
	   logger.info('실행이 성공적으로 완료되었습니다.');
	   return;
	}

	if (['failed', 'cancelled'].includes(run.status)) {
	   logger.error(`실행 실패, 상태: ${run.status}`);
	   throw new GPTReplyError(`Run failed with status: ${run.status}`, undefined, threadId);
	}

	// Run이 아직 완료되지 않았을 때 재귀적으로 상태를 확인
	logger.warn('실행이 아직 완료되지 않았습니다. 다시 확인합니다...');
	await checkRunCompletion(threadId, runId);
};

/**
 * 사용자 및 봇 메시지를 데이터베이스에 저장합니다.
 */
const saveMessages = async (
	userId: bigint,
	userMessage: string,
	botReply: string,
	threadId: string,
	conversationId: string
) => {
	logger.info(`메시지를 데이터베이스에 저장 중: userId=${userId}, threadId=${threadId}, conversationId=${conversationId}`);
	const now = new Date();

	try {
	   // 비동기 트랜잭션 처리
	   await prisma.$transaction(async (tx) => {
		 await tx.nbChatMessages.createMany({
		   data: [
			 {
				userId,
				content: userMessage,
				isBotMessage: false,
				isDeleted: false,
				timestamp: now,
				conversationId,
				threadId,
			 },
			 {
				userId,
				content: botReply,
				isBotMessage: true,
				isDeleted: false,
				timestamp: now,
				conversationId,
				threadId,
			 }
		   ]
		 });
		 await tx.nbChatUsers.update({
		   where: { id: userId },
		   data: { lastInteraction: now }
		 });
	   });
	   logger.info('메시지 저장 성공');
	} catch (error) {
	   logger.error('메시지 저장 중 오류 발생:', error);
	   throw new GPTReplyError('메시지를 저장하는 중 오류가 발생했습니다.');
	}
};

/**
 * 응답 유형에 따라 어시스턴트의 응답을 처리합니다.
 */
const processReply = (content: any, responseType: 'text' | 'json'): string => {
	if (responseType === 'json') {
	   logger.info('JSON 응답 처리 중');
	   if (Array.isArray(content) && content.length > 0 && content[0].type === 'text' && typeof content[0].text?.value === 'string') {
		 return content[0].text.value;
	   }
	   logger.error('잘못된 JSON 응답 형식');
	   throw new GPTReplyError('JSON 응답 형식이 올바르지 않습니다.');
	} else {
	   logger.info('텍스트 응답 처리 중');
	   return Array.isArray(content) ? content.map(item => item.text?.value || '').join('') : content;
	}
};

/**
 * 사용자 입력 및 어시스턴트 설정을 기반으로 GPT 응답을 생성합니다.
 */
export const generateGPTReply = async (
	discordId: string,
	username: string,
	message: string,
	name: string = 'chatgpt 기본',
	responseType: 'text' | 'json' = 'text'
): Promise<string> => {
	logger.info(`generateGPTReply 시작: discordId=${discordId}, username=${username}, message=${message}, name=${name}, responseType=${responseType}`);

	try {
	   // 병렬로 사용자 업서트 및 assistantId 가져오기
	   logger.info('사용자 업서트 및 assistantId 병렬 처리 중');
	   const [user, assistantId] = await Promise.all([
		 prisma.nbChatUsers.upsert({
		   where: { discordId },
		   update: {},
		   create: {
			 discordId,
			 username,
			 contextEnabled: true,
			 timestamp: new Date(),
			 lastInteraction: new Date(),
		   }
		 }),
		 getAssistantId(name)
	   ]);
	   logger.info(`사용자 업서트 완료, id=${user.id}, assistantId=${assistantId}`);

	   // 어시스턴트 설정 가져오기
	   const assistantSettings = await getAssistantSettings(assistantId);
	   logger.info(`어시스턴트 설정 가져오기 완료: ${JSON.stringify(assistantSettings)}`);

	   // 초기 메시지 구성
	   let initialUserMessage = assistantSettings.instructions || 'You are an assistant.';
	   if (responseType === 'json') {
		 initialUserMessage += ' Please provide the response in JSON format.';
		 logger.info('JSON 응답 형식을 위한 초기 사용자 메시지 추가');
	   }

	   const systemMessage = {
		 role: 'user',
		 content: initialUserMessage
	   };

	   // ThreadId 결정
	   let threadId: string | undefined;
	   if (responseType !== 'json') {
		 logger.info('사용자의 최신 threadId 가져오는 중');
		 const threadMessage = await prisma.nbChatMessages.findFirst({
		   where: {
			 userId: user.id,
			 isDeleted: false,
		   },
		   orderBy: { timestamp: 'desc' },
		   select: { threadId: true }
		 });
		 // 명시적으로 null을 undefined로 변환
		 threadId = threadMessage?.threadId ?? undefined;
		 logger.info(`threadId 가져오기 완료: ${threadId || '없음'}`);
	   } else {
		 logger.info('JSON 응답 요청됨. 메모리 초기화를 위해 기존 threadId 무시');
	   }

	   // Response format 설정
	   const responseFormat = responseType === 'json' ? { type: 'json_object' } : undefined;
	   if (responseFormat) {
		 logger.info('응답 형식을 JSON으로 설정');
	   }

	   // Thread 및 Run 처리
	   if (responseType === 'json' || !threadId) {
		 logger.info(responseType === 'json' ? '메모리 초기화를 위해 JSON 응답에 대한 새 스레드 생성' : '기존 threadId를 찾을 수 없습니다. 새 스레드를 생성하고 어시스턴트를 실행합니다.');

		 // 메시지 배열 구성 (새로운 thread)
		 let messages: { role: string, content: string }[] = [{ role: 'user', content: message }];
		 if (responseType === 'json') {
		   messages = [systemMessage, ...messages];
		   logger.info('JSON 응답 형식을 위한 초기 사용자 메시지 추가');
		 } else if (systemMessage.content !== 'You are an assistant.') {
		   messages = [systemMessage, ...messages];
		   logger.info('어시스턴트 설정에서 초기 사용자 메시지 추가');
		 }

		 const runParams: any = {
		   assistant_id: assistantId,
		   thread: { messages },
		   ...(responseFormat && { response_format: responseFormat })
		 };

		 let run: RunExtended;
		 try {
		   run = await openai.beta.threads.createAndRun(runParams) as RunExtended;
		 } catch (error) {
		   logger.error('스레드 생성 및 실행 중 오류 발생:', error);
		   throw new GPTReplyError('스레드를 생성하고 실행하는 중 오류가 발생했습니다.');
		 }

		 logger.info(`새 스레드 생성 및 실행 완료. threadId=${run.thread_id}, runId=${run.id}`);

		 threadId = run.thread_id;
		 await checkRunCompletion(threadId, run.id);

		 // 캐시 업데이트 (새로운 thread)
		 cachedThreadMessages[threadId] = messages;

	   } else {
		 logger.info(`기존 threadId 찾음: ${threadId}. 스레드에 사용자 메시지 추가 중`);

		 // 캐시된 메시지 가져오기
		 let messages: { role: string, content: string }[] = cachedThreadMessages[threadId] || [];

		 // 새 메시지 추가
		 messages.push({ role: 'user', content: message });

		 try {
		   // OpenAI API 호출 (messages는 캐시된 내용 사용)
		   await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });
		   logger.info('스레드에 사용자 메시지 추가 완료');

		   const runParams: any = { assistant_id: assistantId, ...(responseFormat && { response_format: responseFormat }) };
		   let run: RunExtended;
		   try {
			 run = await openai.beta.threads.runs.create(threadId, runParams) as RunExtended;
			 logger.info(`기존 스레드에서 새 실행 생성 완료. runId=${run.id}`);
		   } catch (error) {
			 logger.error('기존 스레드에서 실행 생성 중 오류 발생:', error);
			 throw new GPTReplyError('기존 스레드에서 실행(run)을 생성하는 중 오류가 발생했습니다.', undefined, threadId);
		   }

		   await checkRunCompletion(threadId, run.id);

		   // 캐시 업데이트
		   cachedThreadMessages[threadId] = messages;

		 } catch (error) {
		   logger.error('스레드에 사용자 메시지 추가 중 오류 발생:', error);
		   throw new GPTReplyError('사용자 메시지를 스레드에 추가하는 중 오류가 발생했습니다.', undefined, threadId);
		 }
	   }

	   // 최신 메시지 가져오기
	   logger.info(`${threadId}에서 최신 메시지 가져오는 중`);
	   let threadMessages;
	   try {
		 threadMessages = await openai.beta.threads.messages.list(threadId, {
		   limit: 1,
		   order: 'desc'
		 });
	   } catch (error) {
		 logger.error('스레드에서 메시지 가져오는 중 오류 발생:', error);
		 throw new GPTReplyError('스레드에서 메시지를 가져오는 중 오류가 발생했습니다.', undefined, threadId);
	   }

	   const lastMessage = threadMessages.data[0];
	   logger.info(`최신 메시지 가져오기 완료: ${JSON.stringify(lastMessage)}`);

	   if (!lastMessage || lastMessage.role !== 'assistant') {
		 logger.error('최신 메시지에서 어시스턴트 응답을 찾을 수 없습니다.');
		 throw new GPTReplyError('어시스턴트 응답을 찾을 수 없습니다.');
	   }

	   // 응답 처리
	   let reply: string;
	   try {
		 reply = processReply(lastMessage.content, responseType);
	   } catch (error) {
		 logger.error('응답 처리 중 오류 발생:', error);
		 throw error;
	   }

	   logger.info(`생성된 응답: ${reply}`);

	   // 메시지 저장
	   const conversationId = uuidv4();
	   logger.info(`${conversationId}를 사용하여 대화 저장 중`);

	   try {
		 await saveMessages(user.id, message, reply, threadId, conversationId);
		 logger.info('대화 저장 성공');
	   } catch (error) {
		 logger.error('메시지 저장 중 오류:', error);
		 throw new GPTReplyError('메시지를 저장하는 중 오류가 발생했습니다.');
	   }

	   return reply;

	} catch (error: any) {
	   logger.error('generateGPTReply 에러 발생:', error);
	   const errorMessage = error.error?.message || error.message || '알 수 없는 오류가 발생했습니다.';
	   throw new GPTReplyError(errorMessage, error.status, error.thread_id);
	}
};