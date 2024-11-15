"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const process_1 = __importDefault(require("process"));
const path_1 = __importDefault(require("path"));
const { combine, timestamp, printf, colorize } = winston_1.default.format;
// 로그 파일 저장 경로 설정
const logDir = path_1.default.join(process_1.default.cwd(), 'logs');
// 로그 출력 포맷 정의
const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}] : ${message}`;
});
// Winston 로거 생성
const logger = winston_1.default.createLogger({
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    transports: [
        // info 레벨 로그 저장 설정
        new winston_daily_rotate_file_1.default({
            level: 'info',
            datePattern: 'YYYY-MM-DD',
            dirname: logDir,
            filename: `%DATE%.log`,
            maxFiles: '30d',
            zippedArchive: true,
        }),
        // error 레벨 로그 저장 설정
        new winston_daily_rotate_file_1.default({
            level: 'error',
            datePattern: 'YYYY-MM-DD',
            dirname: path_1.default.join(logDir, 'error'),
            filename: `%DATE%.error.log`,
            maxFiles: '30d',
            zippedArchive: true,
        }),
    ],
    exceptionHandlers: [
        // uncaughtException 로그 저장 설정
        new winston_daily_rotate_file_1.default({
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
if (process_1.default.env.NODE_ENV !== 'production') {
    logger.add(new winston_1.default.transports.Console({
        format: combine(colorize({ all: true }), // 모든 출력에 색상 적용
        printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}] : ${message}`)),
    }));
}
exports.default = logger;
