import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';
import process from 'process';
import path from 'path';

const { combine, timestamp, printf, colorize } = winston.format;

// 로그 파일 저장 경로 설정
const logDir = path.join(process.cwd(), 'logs');

// 로그 출력 포맷 정의
const logFormat = printf(({ level, message, timestamp }) => {
	return `${timestamp} [${level.toUpperCase()}] : ${message}`;
});

// Winston 로거 생성
const logger = winston.createLogger({
	format: combine(
		timestamp({ format: 'MM-DD HH:mm:ss' }), // YYYY-MM-DD 제거
		logFormat
	),
	transports: [
		// info 레벨 로그 저장 설정
		new winstonDaily({
			level: 'info',
			datePattern: 'YYYY-MM-DD',
			dirname: logDir,
			filename: `%DATE%.log`,
			maxFiles: '30d',
			zippedArchive: true,
		}),
		// error 레벨 로그 저장 설정
		new winstonDaily({
			level: 'error',
			datePattern: 'YYYY-MM-DD',
			dirname: path.join(logDir, 'error'),
			filename: `%DATE%.error.log`,
			maxFiles: '30d',
			zippedArchive: true,
		}),
	],
	exceptionHandlers: [
		// uncaughtException 로그 저장 설정
		new winstonDaily({
			level: 'error',
			datePattern: 'YYYY-MM-DD',
			dirname: logDir,
			filename: `%DATE%.exception.log`,
			maxFiles: '30d',
			zippedArchive: true,
		}),
	],
});

// 개발 환경에서는 콘솔에 컬러 로그 출력
if (process.env.NODE_ENV !== 'production') {
	logger.add(
		new winston.transports.Console({
			format: combine(
				colorize({ all: true }), // 모든 출력에 색상 적용
				printf(({ level, message, timestamp }) =>
					`${timestamp} [${level.toUpperCase()}] : ${message}` // YYYY-MM-DD 제거
				)
			),
		})
	);
}

export default logger;