import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";

import db from "../models/index.js";

const { User, Doctor, Queue, Appointment } = db;

const DEFAULT_JWT_ISSUER = "luong-hospital-api";
const DEFAULT_JWT_AUDIENCE = "luong-clinic-platform";

let webSocketServer = null;
const clients = new Set();

const parseTokenFromRequest = (req) => {
  const url = new URL(req.url || "", "http://localhost");
  return url.searchParams.get("access_token") || url.searchParams.get("token");
};

const authenticateSocketRequest = async (req) => {
  const token = parseTokenFromRequest(req);
  const jwtSecret = process.env.JWT_SECRET;

  if (!token || !jwtSecret) {
    return null;
  }

  const decoded = jwt.verify(token, jwtSecret, {
    issuer: process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE,
  });

  const user = await User.findByPk(decoded.id, {
    attributes: ["id", "role", "status"],
  });

  if (!user || user.status === "Inactive") {
    return null;
  }

  const doctor = user.role === "DOCTOR"
    ? await Doctor.findOne({ where: { user_id: user.id }, attributes: ["id"] })
    : null;

  return {
    userId: user.id,
    role: user.role,
    doctorId: doctor?.id ?? null,
  };
};

const safeSend = (client, event) => {
  if (client.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  client.socket.send(JSON.stringify(event));
};

const canReceiveEvent = (client, event) => {
  const payload = event.payload || {};

  if (client.role === "ADMIN" || client.role === "RECEPTIONIST") {
    return true;
  }

  if (client.role === "DOCTOR") {
    return Number(payload.doctor_id) === Number(client.doctorId);
  }

  if (client.role === "PATIENT") {
    if (Number(payload.patient_id) === Number(client.userId)) {
      return true;
    }

    return Array.isArray(payload.patient_ids)
      && payload.patient_ids.some((patientId) => Number(patientId) === Number(client.userId));
  }

  return false;
};

const emitToAuthorizedClients = (event) => {
  for (const client of clients) {
    if (canReceiveEvent(client, event)) {
      safeSend(client, event);
    }
  }
};

const buildRealtimeEvent = (type, payload) => ({
  type,
  payload: {
    ...payload,
    emitted_at: new Date().toISOString(),
  },
});

const getAffectedPatientIdsForDoctorDate = async (doctorId, date) => {
  if (!doctorId || !date) {
    return [];
  }

  const queues = await Queue.findAll({
    where: {
      doctor_id: doctorId,
      date,
    },
    include: [
      {
        model: Appointment,
        attributes: ["patient_id", "status"],
      },
    ],
    attributes: ["id"],
  });

  return Array.from(
    new Set(
      queues
        .map((queue) => Number(queue.Appointment?.patient_id))
        .filter((patientId) => Number.isInteger(patientId) && patientId > 0)
    )
  );
};

export const initRealtimeServer = (server) => {
  if (webSocketServer) {
    return webSocketServer;
  }

  webSocketServer = new WebSocketServer({
    server,
    path: "/ws",
  });

  webSocketServer.on("connection", async (socket, req) => {
    try {
      const client = await authenticateSocketRequest(req);
      if (!client) {
        socket.close(1008, "Unauthorized");
        return;
      }

      const trackedClient = {
        ...client,
        socket,
      };

      clients.add(trackedClient);
      safeSend(trackedClient, buildRealtimeEvent("connection.ready", {
        role: client.role,
      }));

      socket.on("close", () => {
        clients.delete(trackedClient);
      });
    } catch {
      socket.close(1008, "Unauthorized");
    }
  });

  return webSocketServer;
};

export const publishQueueRealtimeEvent = async (payload) => {
  emitToAuthorizedClients(buildRealtimeEvent("queue.updated", payload));
};

export const publishQueueForecastRealtimeEvent = async (payload) => {
  const patientIds = Array.isArray(payload?.patient_ids)
    ? payload.patient_ids
    : await getAffectedPatientIdsForDoctorDate(payload?.doctor_id, payload?.date);

  emitToAuthorizedClients(buildRealtimeEvent("queue.forecast.updated", {
    ...payload,
    patient_ids: patientIds,
  }));
};
