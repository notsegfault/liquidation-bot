import { ethers, Wallet } from 'ethers';
import { logger } from './logging';
import 'dotenv-defaults/config';
const ContractABI = require('../abi/abi.json');

['WALLET_PRIVATE_KEY', 'JSON_RPC_URL', 'LIQUIDATION_POLLING_TIME_IN_MS', 'CONTRACT_ADDRESS'].forEach((k) => {
  if (!process.env[k]) {
    throw new TypeError(`${k} environement variable must be defined.`);
  }
});

const settings = {
  privateKey: process.env.WALLET_PRIVATE_KEY!,
  jsonRpcUrl: process.env.JSON_RPC_URL,
  contractAddress: process.env.CONTRACT_ADDRESS,
  liquidationPollingTimeInMs: parseInt(process.env.LIQUIDATION_POLLING_TIME_IN_MS!),
};

logger.info(`Using RPC ${settings.jsonRpcUrl}`);
logger.info(`Contract Address ${settings.contractAddress}`);
const provider = new ethers.providers.JsonRpcProvider(settings.jsonRpcUrl);

const wallet = new Wallet(settings.privateKey, provider);

const main = async () => {
  const toBlock = await provider.getBlockNumber();

  // TODO: use contract blocknumber when it's been deployed
  const fromBlock = toBlock - 1000;

  const address = settings.contractAddress!;
  const contract = new ethers.Contract(address, ContractABI, wallet);
  const topics = [ethers.utils.id('Loaned(address,address,uint256,uint256,bool)')];

  const logs = await provider.getLogs({
    address,
    topics,
    fromBlock,
    toBlock,
  });

  // Get all the accounts that emitted the events and remove duplicates using `Set`
  logger.info('Fetching past events...');
  let accounts = [
    ...new Set(
      logs
        .filter((l) => !l.removed)
        .map((log) => {
          return ethers.utils.hexStripZeros(log.topics[1]);
        })
    ),
  ];

  logger.info(`Found ${accounts.length} accounts with potential loans`);
  logger.info('Subscribing to Loan event...');

  provider.on(
    {
      address,
      topics,
    },
    async (log) => {
      const account = ethers.utils.hexStripZeros(log.topics[1]);
      accounts = [...new Set([account, ...accounts])];

      logger.info(`New account ${account}, total account ${accounts.length}`);
    }
  );

  runLiquidations(accounts, contract);

  setInterval(() => runLiquidations(accounts, contract), settings.liquidationPollingTimeInMs);
};

const runLiquidations = async (accounts: string[], contract: ethers.Contract) => {
  logger.info('Looking for liquidations...');

  for (const account of accounts) {
    try {
      const gas = await contract.estimateGas.liquidate(account, true);
      logger.info(`Liquidating ${account} CORE collateral...`);

      try {
        await contract.liquidate(account, true);
      } catch (e) {
        logger.error(e);
      }
    } catch { }
    try {
      await contract.estimateGas.liquidate(account, false);
      logger.info(`Liquidating ${account} CoreDAO collateral...`);

      try {
        await contract.liquidate(account, false);
      } catch (e) {
        logger.error(e);
      }
    } catch { }
  }
};


main();
