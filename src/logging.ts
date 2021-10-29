import { createLogger, format, transports } from 'winston';
const { combine, splat, timestamp, printf } = format;

const myFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message} `;
  if (metadata) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

export const logger = createLogger({
  transports: [
    new transports.Console({
      level: 'debug',
      format: combine(format.colorize(), splat(), timestamp(), myFormat),
    }),
    new transports.File({
      filename: 'log/app.log',
      level: 'debug',
      format: combine(format.uncolorize(), splat(), timestamp(), myFormat),
    }),
  ],
});
