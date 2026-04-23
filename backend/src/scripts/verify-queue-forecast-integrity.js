import db from "../models/index.js";
import associateModels from "../models/associations.js";

const { sequelize, Queue, WaitPrediction } = db;

associateModels(db);

const parseDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameMinute = (left, right) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return Math.floor(left.getTime() / 60000) === Math.floor(right.getTime() / 60000);
};

const main = async () => {
  const queues = await Queue.findAll({
    order: [
      ["date", "ASC"],
      ["queue_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const predictions = await WaitPrediction.findAll({
    order: [
      ["queue_id", "ASC"],
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
  });

  const latestPredictionByQueueId = new Map();
  for (const prediction of predictions) {
    if (!latestPredictionByQueueId.has(prediction.queue_id)) {
      latestPredictionByQueueId.set(prediction.queue_id, prediction);
    }
  }

  const issues = [];

  for (const queue of queues) {
    const latestPrediction = latestPredictionByQueueId.get(queue.id) ?? null;
    const queueEstimatedStart = parseDateTime(queue.estimated_start);
    const queueOriginalEstimatedStart = parseDateTime(queue.original_estimated_start);
    const latestPredictedStart = parseDateTime(latestPrediction?.predicted_start);

    if (!queueEstimatedStart) {
      issues.push(`queue#${queue.id}: missing estimated_start`);
    }

    if (!queueOriginalEstimatedStart) {
      issues.push(`queue#${queue.id}: missing original_estimated_start`);
    }

    if (!parseDateTime(queue.forecast_updated_at)) {
      issues.push(`queue#${queue.id}: missing forecast_updated_at`);
    }

    if (!latestPrediction) {
      issues.push(`queue#${queue.id}: missing latest wait_prediction`);
      continue;
    }

    if (queue.latest_prediction_id !== latestPrediction.id) {
      issues.push(
        `queue#${queue.id}: latest_prediction_id=${queue.latest_prediction_id ?? "null"} but latest prediction is #${latestPrediction.id}`
      );
    }

    if (!isSameMinute(queueEstimatedStart, latestPredictedStart)) {
      issues.push(
        `queue#${queue.id}: estimated_start does not match latest predicted_start`
      );
    }

    if (
      typeof queue.predicted_wait_minutes === "number" &&
      typeof latestPrediction.predicted_wait_time === "number" &&
      queue.predicted_wait_minutes !== latestPrediction.predicted_wait_time
    ) {
      issues.push(
        `queue#${queue.id}: predicted_wait_minutes=${queue.predicted_wait_minutes} but latest prediction=${latestPrediction.predicted_wait_time}`
      );
    }
  }

  if (issues.length === 0) {
    console.info(`[forecast verify] OK. checked ${queues.length} queue(s), no issue found.`);
    return;
  }

  console.info(`[forecast verify] found ${issues.length} issue(s) across ${queues.length} queue(s).`);
  for (const issue of issues) {
    console.info(`[forecast verify] ${issue}`);
  }
  process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error("[forecast verify] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
