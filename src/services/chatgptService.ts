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
	.then(() => logger.info('Prisma connected to the database'))
	.catch(error => {
		logger.error('Prisma connection error:', error);
		process.exit(1);
	});

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// 캐시를 위한 인메모리 저장소
const cachedAssistantIds: Record<string, string> = {};
const cachedAssistantSettings: Record<string, any> = {};

// 인터페이스 확장
interface RunExtended extends Run {
	thread_id: string;
}

/**
 * Fetches and caches the assistant ID based on the assistant name.
 */
const getAssistantId = async (name: string): Promise<string> => {
	logger.info(`Fetching assistantId for name: ${name}`);

	if (cachedAssistantIds[name]) {
		logger.info(`Found cached assistantId for ${name}: ${cachedAssistantIds[name]}`);
		return cachedAssistantIds[name];
	}

	const assistant = await prisma.nbAssistants.findFirst({
		where: { name },
		select: { assistantId: true },
	});

	if (!assistant?.assistantId) {
		logger.error(`No assistantId found in DB for name: ${name}`);
		throw new GPTReplyError(`데이터베이스에서 이름이 '${name}'인 유효한 assistantId를 찾을 수 없습니다.`);
	}

	cachedAssistantIds[name] = assistant.assistantId;
	logger.info(`Cached assistantId for ${name}: ${assistant.assistantId}`);
	return assistant.assistantId;
};

/**
 * Fetches and caches the assistant settings based on the assistant ID.
 */
const getAssistantSettings = async (assistantId: string): Promise<any> => {
	logger.info(`Fetching assistant settings for assistantId: ${assistantId}`);

	if (cachedAssistantSettings[assistantId]) {
		logger.info(`Found cached assistant settings for assistantId: ${assistantId}`);
		return cachedAssistantSettings[assistantId];
	}

	try {
		const assistantSettings = await openai.beta.assistants.retrieve(assistantId);
		cachedAssistantSettings[assistantId] = assistantSettings;
		logger.info(`Cached assistant settings for assistantId: ${assistantId}`);
		return assistantSettings;
	} catch (error) {
		logger.error(`Error retrieving assistant settings for assistantId ${assistantId}:`, error);
		throw new GPTReplyError('어시스턴트 설정을 가져오는 중 오류가 발생했습니다.');
	}
};

/**
 * Recursively checks if the OpenAI run has completed without using timeouts.
 */
const checkRunCompletion = async (
	threadId: string,
	runId: string
): Promise<void> => {
	logger.info(`Checking run completion: threadId=${threadId}, runId=${runId}`);

	let run: Run | undefined;

	try {
		run = await retryOpenAIRun(threadId, runId);
	} catch (error) {
		logger.error('Error during run status check:', error);
		throw new GPTReplyError('실행(run) 상태를 확인하는 중 오류가 발생했습니다.', undefined, threadId);
	}

	logger.info(`Run status: ${run.status}`);

	if (run.status === 'completed') {
		logger.info('Run completed successfully');
		return;
	}

	if (['failed', 'cancelled'].includes(run.status)) {
		logger.error(`Run failed with status: ${run.status}`);
		throw new GPTReplyError(`Run failed with status: ${run.status}`, undefined, threadId);
	}

	// Run이 아직 완료되지 않았을 때 재귀적으로 상태를 확인
	logger.warn('Run is not completed yet. Checking again...');
	await checkRunCompletion(threadId, runId);
};

/**
 * Saves user and bot messages to the database.
 */
const saveMessages = async (
	userId: bigint,
	userMessage: string,
	botReply: string,
	threadId: string,
	conversationId: string
) => {
	logger.info(`Saving messages to DB: userId=${userId}, threadId=${threadId}, conversationId=${conversationId}`);
	const now = new Date();

	try {
		await prisma.$transaction([
			prisma.nbChatMessages.createMany({
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
			}),
			prisma.nbChatUsers.update({
				where: { id: userId },
				data: { lastInteraction: now }
			})
		]);
		logger.info('Messages saved successfully');
	} catch (error) {
		logger.error('Error saving messages:', error);
		throw new GPTReplyError('메시지를 저장하는 중 오류가 발생했습니다.');
	}
};

/**
 * Retries retrieving an OpenAI run with exponential backoff.
 */
const retryOpenAIRun = async (
	threadId: string,
	runId: string,
	retryCount: number = 3
): Promise<Run> => {
	for (let attempt = 0; attempt < retryCount; attempt++) {
		try {
			const run = await openai.beta.threads.runs.retrieve(threadId, runId);
			return run as Run;
		} catch (error) {
			logger.error(`Attempt ${attempt + 1} failed to retrieve run. Retrying...`);
			await new Promise(resolve => setTimeout(resolve, 500)); // 짧은 재시도 대기 시간
		}
	}
	throw new GPTReplyError('Run 정보를 여러 번 시도했지만 가져오지 못했습니다.');
};

/**
 * Processes the assistant's reply based on the response type.
 */
const processReply = (content: any, responseType: 'text' | 'json'): string => {
	if (responseType === 'json') {
		logger.info('Processing JSON response');
		if (Array.isArray(content) && content.length > 0) {
			const firstContent = content[0];
			if (firstContent.type === 'text' && typeof firstContent.text?.value === 'string') {
				return firstContent.text.value;
			}
		}
		logger.error('Invalid JSON response format');
		throw new GPTReplyError('JSON 응답 형식이 올바르지 않습니다.');
	} else {
		logger.info('Processing text response');
		if (Array.isArray(content)) {
			return content
				.filter(item => 'text' in item)
				.map(item => item.text?.value || '')
				.join('');
		} else if (typeof content === 'string') {
			return content;
		}
		logger.error('Invalid text response format');
		throw new GPTReplyError('응답 형식이 올바르지 않습니다.');
	}
};

/**
 * Generates a GPT reply based on user input and assistant settings.
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
		logger.info('Upserting user and fetching assistantId in parallel');
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
		logger.info(`User upserted with id=${user.id}, assistantId=${assistantId}`);

		// 어시스턴트 설정 가져오기
		const assistantSettings = await getAssistantSettings(assistantId);
		logger.info(`Retrieved assistant settings: ${JSON.stringify(assistantSettings)}`);

		// 초기 메시지 구성
		let initialUserMessage = assistantSettings.instructions || 'You are an assistant.';
		if (responseType === 'json') {
			initialUserMessage += ' Please provide the response in JSON format.';
			logger.info('Appending JSON response instruction to initial user message');
		}

		const systemMessage = {
			role: 'user',
			content: initialUserMessage
		};

		// ThreadId 결정
		let threadId: string | undefined;
		if (responseType !== 'json') {
			logger.info('Fetching the latest threadId for the user');
			const threadMessage = await prisma.nbChatMessages.findFirst({
				where: {
					userId: user.id,
					isDeleted: false,
				},
				orderBy: { timestamp: 'desc' },
				select: { threadId: true }
			});
			// Explicitly convert null to undefined
			threadId = threadMessage?.threadId ?? undefined;
			logger.info(`Retrieved threadId: ${threadId || 'None'}`);
		} else {
			logger.info('JSON response requested. Ignoring existing threadId to clear memory.');
		}

		// Response format 설정
		const responseFormat = responseType === 'json' ? { type: 'json_object' } : undefined;
		if (responseFormat) {
			logger.info('Response format set to JSON');
		}

		// 메시지 배열 구성
		let messages: { role: string, content: string }[] = [{ role: 'user', content: message }];
		if (responseType === 'json') {
			messages = [systemMessage, ...messages];
			logger.info('Added initial user message for JSON response format');
		} else if (systemMessage.content !== 'You are an assistant.') {
			messages = [systemMessage, ...messages];
			logger.info('Added initial user message from assistant settings');
		}

		// Thread 및 Run 처리
		if (responseType === 'json' || !threadId) {
			logger.info(responseType === 'json' ? 'Creating a new thread for JSON response to clear memory' : 'No existing threadId found. Creating a new thread and running the assistant');

			const runParams: any = {
				assistant_id: assistantId,
				thread: { messages },
				...(responseFormat && { response_format: responseFormat })
			};

			let run: RunExtended;
			try {
				run = await openai.beta.threads.createAndRun(runParams) as RunExtended;
			} catch (error) {
				logger.error('Error creating and running thread:', error);
				throw new GPTReplyError('스레드를 생성하고 실행하는 중 오류가 발생했습니다.');
			}

			logger.info(`Created and ran a new thread. threadId=${run.thread_id}, runId=${run.id}`);

			threadId = run.thread_id;
			await checkRunCompletion(threadId, run.id);
		} else {
			logger.info(`Existing threadId found: ${threadId}. Adding user message to thread`);
			try {
				await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });
				logger.info('User message added to thread');
			} catch (error) {
				logger.error('Error adding user message to thread:', error);
				throw new GPTReplyError('사용자 메시지를 스레드에 추가하는 중 오류가 발생했습니다.', undefined, threadId);
			}

			const runParams: any = { assistant_id: assistantId, ...(responseFormat && { response_format: responseFormat }) };
			let run: RunExtended;
			try {
				run = await openai.beta.threads.runs.create(threadId, runParams) as RunExtended;
				logger.info(`Created a new run in existing thread. runId=${run.id}`);
			} catch (error) {
				logger.error('Error creating run in existing thread:', error);
				throw new GPTReplyError('기존 스레드에서 실행(run)을 생성하는 중 오류가 발생했습니다.', undefined, threadId);
			}

			await checkRunCompletion(threadId, run.id);
		}

		// 최신 메시지 가져오기
		logger.info(`Fetching the latest message from threadId=${threadId}`);
		let threadMessages;
		try {
			threadMessages = await openai.beta.threads.messages.list(threadId, {
				limit: 1,
				order: 'desc'
			});
		} catch (error) {
			logger.error('Error fetching messages from thread:', error);
			throw new GPTReplyError('스레드에서 메시지를 가져오는 중 오류가 발생했습니다.', undefined, threadId);
		}

		const lastMessage = threadMessages.data[0];
		logger.info(`Last message retrieved: ${JSON.stringify(lastMessage)}`);

		if (!lastMessage || lastMessage.role !== 'assistant') {
			logger.error('Assistant reply not found in the latest message');
			throw new GPTReplyError('어시스턴트 응답을 찾을 수 없습니다.');
		}

		// 응답 처리
		let reply: string;
		try {
			reply = processReply(lastMessage.content, responseType);
		} catch (error) {
			logger.error('Error processing reply:', error);
			throw error;
		}

		logger.info(`Generated reply: ${reply}`);

		// 메시지 저장
		const conversationId = uuidv4();
		logger.info(`Saving conversation with conversationId=${conversationId}`);

		try {
			await saveMessages(user.id, message, reply, threadId, conversationId);
			logger.info('Conversation saved successfully');
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
