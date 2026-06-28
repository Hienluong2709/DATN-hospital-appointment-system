import express from "express";
import { authenticate, authorize } from "../middlewares/authMiddleware.js";
import {
  createSpecialty,
  deleteSpecialty,
  getAllSpecialties,
  getSpecialtyById,
  updateSpecialty,
} from "../controllers/specialtyController.js";

const router = express.Router();

router.get("/", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getAllSpecialties);
router.get("/:id", authenticate, authorize(["ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), getSpecialtyById);
router.post("/", authenticate, authorize(["ADMIN"]), createSpecialty);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateSpecialty);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteSpecialty);

export default router;
