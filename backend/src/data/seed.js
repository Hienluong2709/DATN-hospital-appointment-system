import db from "../models/index.js";
import initAssociations from "../models/associations.js";

const {
  sequelize,
  User,
  Doctor,
  Specialty,
  Room,
  WorkSchedule,
  Appointment,
  Queue,
  WaitPrediction,
  Template,
  SmsLog,
  OtpCode,
  EQueueNumber,
} = db;

initAssociations(db);

const mapBy = (items, getKey) =>
  new Map(items.map((item, index) => [getKey(item, index), item]));

const withBusinessOffset = (date, time) => `${date}T${time}+07:00`;

async function seed() {
  try {
    await sequelize.authenticate();

    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    await WaitPrediction.truncate({ restartIdentity: true });
    await Queue.truncate({ restartIdentity: true });
    await Appointment.truncate({ restartIdentity: true });
    await WorkSchedule.truncate({ restartIdentity: true });
    await Doctor.truncate({ restartIdentity: true });
    await Room.truncate({ restartIdentity: true });
    await Specialty.truncate({ restartIdentity: true });
    await SmsLog.truncate({ restartIdentity: true });
    await Template.truncate({ restartIdentity: true });
    await OtpCode.truncate({ restartIdentity: true });
    await EQueueNumber.truncate({ restartIdentity: true });
    await User.truncate({ restartIdentity: true });
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log("🌱 Seeding data...");

    const specialtyPayloads = [
      {
        name: "Tim mạch",
        description: "Khám và theo dõi các bệnh lý tim mạch, huyết áp, rối loạn nhịp tim.",
      },
      {
        name: "Da liễu",
        description: "Khám da liễu tổng quát, tư vấn và điều trị các bệnh lý da, tóc, móng.",
      },
      {
        name: "Nhi khoa",
        description: "Theo dõi sức khỏe trẻ em, khám bệnh hô hấp, tiêu hóa và dinh dưỡng nhi.",
      },
      {
        name: "Nội tổng quát",
        description: "Khám nội khoa chung cho người lớn, quản lý bệnh mạn tính và bệnh lý thường gặp.",
      },
      {
        name: "Tai mũi họng",
        description: "Khám và điều trị các bệnh lý tai, mũi, họng và viêm đường hô hấp trên.",
      },
      {
        name: "Sản phụ khoa",
        description: "Khám sản khoa, phụ khoa định kỳ, tư vấn chăm sóc sức khỏe phụ nữ.",
      },
      {
        name: "Chấn thương chỉnh hình",
        description: "Khám xương khớp, chấn thương thể thao và phục hồi chức năng sau điều trị.",
      },
      {
        name: "Thần kinh",
        description: "Khám đau đầu, chóng mặt, rối loạn thần kinh và theo dõi bệnh lý thần kinh mạn tính.",
      },
      {
        name: "Tiêu hóa",
        description: "Khám đau bụng, trào ngược, viêm loét và các bệnh lý tiêu hóa thường gặp.",
      },
    ];

    const specialties = await Specialty.bulkCreate(specialtyPayloads);
    const specialtyByName = mapBy(specialties, (specialty) => specialty.name);

    const roomPayloads = [
      {
        name: "A101",
        floor: 1,
        specialty: "Tim mạch",
        description: "Phòng khám tim mạch tổng quát, gần khu tiếp đón tầng 1.",
      },
      {
        name: "A102",
        floor: 1,
        specialty: "Da liễu",
        description: "Phòng khám da liễu với khu thủ thuật nhỏ và soi da cơ bản.",
      },
      {
        name: "A103",
        floor: 1,
        specialty: "Nội tổng quát",
        description: "Phòng khám nội tổng quát cho bệnh nhân theo lịch hẹn và walk-in.",
      },
      {
        name: "A104",
        floor: 1,
        specialty: "Tai mũi họng",
        description: "Phòng khám tai mũi họng có khu nội soi và rửa mũi họng.",
      },
      {
        name: "B201",
        floor: 2,
        specialty: "Nhi khoa",
        description: "Phòng khám nhi khoa, gần khu chờ riêng cho trẻ em.",
      },
      {
        name: "B202",
        floor: 2,
        specialty: "Sản phụ khoa",
        description: "Phòng khám sản phụ khoa định kỳ và tư vấn theo dõi thai.",
      },
      {
        name: "B203",
        floor: 2,
        specialty: "Chấn thương chỉnh hình",
        description: "Phòng khám xương khớp và chấn thương chỉnh hình.",
      },
      {
        name: "C301",
        floor: 3,
        specialty: "Thần kinh",
        description: "Phòng khám thần kinh và theo dõi tái khám bệnh nhân mạn tính.",
      },
      {
        name: "C302",
        floor: 3,
        specialty: "Tiêu hóa",
        description: "Phòng khám tiêu hóa và tư vấn chế độ ăn uống theo bệnh lý.",
      },
      {
        name: "C303",
        floor: 3,
        specialty: "Tim mạch",
        description: "Phòng dự phòng cho tim mạch trong giờ cao điểm.",
        status: "Maintenance",
      },
    ];

    const rooms = await Room.bulkCreate(
      roomPayloads.map((room) => ({
        name: room.name,
        floor: room.floor,
        specialty_id: specialtyByName.get(room.specialty).id,
        description: room.description,
        status: room.status || "Available",
      })),
    );
    const roomByName = mapBy(rooms, (room) => room.name);

    const userPayloads = [
      {
        username: "admin",
        password: "123456",
        fullname: "Nguyễn Minh Quân",
        email: "admin@gmail.com",
        phone: "0901000001",
        role: "ADMIN",
        gender: "MALE",
        address: "Q.1, TP.HCM",
      },
      {
        username: "admin_ops",
        password: "123456",
        fullname: "Tran Hoai Thu",
        email: "admin.ops@gmail.com",
        phone: "0901000002",
        role: "ADMIN",
        gender: "FEMALE",
        address: "Q.3, TP.HCM",
      },
      {
        username: "reception1",
        password: "123456",
        fullname: "Lễ tân 1",
        email: "reception1@gmail.com",
        phone: "0902000001",
        role: "RECEPTIONIST",
        gender: "FEMALE",
        address: "Q.Bình Thạnh, TP.HCM",
      },
      {
        username: "reception2",
        password: "123456",
        fullname: "Lễ tân 2",
        email: "reception2@gmail.com",
        phone: "0902000002",
        role: "RECEPTIONIST",
        gender: "FEMALE",
        address: "Q.Phú Nhuận, TP.HCM",
      },
      {
        username: "reception3",
        password: "123456",
        fullname: "Lễ tân 3",
        email: "reception3@gmail.com",
        phone: "0902000003",
        role: "RECEPTIONIST",
        gender: "OTHER",
        address: "Q.Gò Vấp, TP.HCM",
      },
      {
        username: "doctorA",
        password: "123456",
        fullname: "Dr. A",
        email: "doctorA@gmail.com",
        phone: "0903000001",
        role: "DOCTOR",
        gender: "MALE",
      },
      {
        username: "doctorB",
        password: "123456",
        fullname: "Dr. B",
        email: "doctorB@gmail.com",
        phone: "0903000002",
        role: "DOCTOR",
        gender: "FEMALE",
      },
      {
        username: "doctorC",
        password: "123456",
        fullname: "Dr. C",
        email: "doctorC@gmail.com",
        phone: "0903000003",
        role: "DOCTOR",
        gender: "FEMALE",
      },
      {
        username: "doctorD",
        password: "123456",
        fullname: "Dr. D",
        email: "doctorD@gmail.com",
        phone: "0903000004",
        role: "DOCTOR",
        gender: "MALE",
      },
      {
        username: "doctorE",
        password: "123456",
        fullname: "Dr. E",
        email: "doctorE@gmail.com",
        phone: "0903000005",
        role: "DOCTOR",
        gender: "MALE",
      },
      {
        username: "doctorF",
        password: "123456",
        fullname: "Dr. F",
        email: "doctorF@gmail.com",
        phone: "0903000006",
        role: "DOCTOR",
        gender: "FEMALE",
      },
      {
        username: "doctorG",
        password: "123456",
        fullname: "Dr. G",
        email: "doctorG@gmail.com",
        phone: "0903000007",
        role: "DOCTOR",
        gender: "MALE",
      },
      {
        username: "doctorH",
        password: "123456",
        fullname: "Dr. H",
        email: "doctorH@gmail.com",
        phone: "0903000008",
        role: "DOCTOR",
        gender: "FEMALE",
      },
      {
        username: "doctorI",
        password: "123456",
        fullname: "Dr. I",
        email: "doctorI@gmail.com",
        phone: "0903000009",
        role: "DOCTOR",
        gender: "MALE",
      },
      {
        username: "patient1",
        password: "123456",
        fullname: "Nguyen Van A",
        email: "patient1@gmail.com",
        phone: "0904000001",
        role: "PATIENT",
        gender: "MALE",
      },
      {
        username: "patient2",
        password: "123456",
        fullname: "Tran Thi B",
        email: "patient2@gmail.com",
        phone: "0904000002",
        role: "PATIENT",
        gender: "FEMALE",
      },
      {
        username: "patient3",
        password: "123456",
        fullname: "Le Hoang C",
        email: "patient3@gmail.com",
        phone: "0904000003",
        role: "PATIENT",
        gender: "MALE",
      },
      {
        username: "patient4",
        password: "123456",
        fullname: "Pham Ngoc D",
        email: "patient4@gmail.com",
        phone: "0904000004",
        role: "PATIENT",
        gender: "FEMALE",
      },
      {
        username: "patient5",
        password: "123456",
        fullname: "Vo Minh E",
        email: "patient5@gmail.com",
        phone: "0904000005",
        role: "PATIENT",
        gender: "MALE",
      },
      {
        username: "patient6",
        password: "123456",
        fullname: "Đặng Thu F",
        email: "patient6@gmail.com",
        phone: "0904000006",
        role: "PATIENT",
        gender: "FEMALE",
      },
      {
        username: "patient7",
        password: "123456",
        fullname: "Bui Quoc G",
        email: "patient7@gmail.com",
        phone: "0904000007",
        role: "PATIENT",
        gender: "MALE",
      },
      {
        username: "patient8",
        password: "123456",
        fullname: "Do Thi H",
        email: "patient8@gmail.com",
        phone: "0904000008",
        role: "PATIENT",
        gender: "FEMALE",
      },
    ];

    const users = await User.bulkCreate(userPayloads, {
      individualHooks: true,
    });
    const userByUsername = mapBy(users, (user) => user.username);

    const doctorPayloads = [
      {
        username: "doctorA",
        specialty: "Tim mạch",
        room: "A101",
        description: "Bác sĩ tim mạch chuyên theo dõi tăng huyết áp và rối loạn nhịp tim.",
      },
      {
        username: "doctorB",
        specialty: "Da liễu",
        room: "A102",
        description: "Bác sĩ da liễu phụ trách khám tổng quát và tái khám điều trị dài ngày.",
      },
      {
        username: "doctorC",
        specialty: "Nhi khoa",
        room: "B201",
        description: "Bác sĩ nhi khoa theo dõi hô hấp, tiêu hóa và dinh dưỡng trẻ em.",
      },
      {
        username: "doctorD",
        specialty: "Nội tổng quát",
        room: "A103",
        description: "Bác sĩ nội tổng quát chuyên quản lý bệnh nhân tăng huyết áp và đái tháo đường.",
      },
      {
        username: "doctorE",
        specialty: "Tai mũi họng",
        room: "A104",
        description: "Bác sĩ tai mũi họng chuyên khám viêm xoang, viêm họng và bệnh tai giữa.",
      },
      {
        username: "doctorF",
        specialty: "Sản phụ khoa",
        room: "B202",
        description: "Bác sĩ sản phụ khoa phụ trách khám định kỳ và theo dõi thai ngoài giờ cao điểm.",
      },
      {
        username: "doctorG",
        specialty: "Chấn thương chỉnh hình",
        room: "B203",
        description: "Bác sĩ chấn thương chỉnh hình phụ trách khám đau khớp và chấn thương thể thao.",
      },
      {
        username: "doctorH",
        specialty: "Thần kinh",
        room: "C301",
        description: "Bác sĩ thần kinh theo dõi đau đầu, mất ngủ và tái khám bệnh nhân mạn tính.",
      },
      {
        username: "doctorI",
        specialty: "Tiêu hóa",
        room: "C302",
        description: "Bác sĩ tiêu hóa chuyên khám đau bụng, trào ngược và bệnh lý dạ dày ruột.",
      },
    ];

    const doctors = await Doctor.bulkCreate(
      doctorPayloads.map((doctor) => ({
        user_id: userByUsername.get(doctor.username).id,
        specialty_id: specialtyByName.get(doctor.specialty).id,
        room_id: roomByName.get(doctor.room).id,
        description: doctor.description,
        status: "Active",
      })),
    );
    const doctorByUsername = mapBy(doctors, (_, index) => doctorPayloads[index].username);

    const schedulePayloads = [];
    const addSchedules = (doctorUsername, days, startTime, endTime) => {
      for (const dayOfWeek of days) {
        schedulePayloads.push({
          doctor_id: doctorByUsername.get(doctorUsername).id,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
        });
      }
    };

    addSchedules("doctorA", [1, 2, 3, 4, 5], "08:00:00", "12:00:00");
    addSchedules("doctorA", [1, 2, 3, 4, 5], "13:30:00", "17:00:00");
    addSchedules("doctorA", [6], "08:00:00", "11:30:00");

    addSchedules("doctorB", [1, 2, 3, 4, 5], "08:00:00", "12:00:00");
    addSchedules("doctorB", [2, 4], "13:00:00", "16:30:00");

    addSchedules("doctorC", [1, 3, 5], "07:30:00", "11:30:00");
    addSchedules("doctorC", [1, 3, 5], "13:00:00", "16:30:00");
    addSchedules("doctorC", [2, 4], "08:00:00", "11:30:00");

    addSchedules("doctorD", [1, 2, 3, 4, 5, 6], "08:00:00", "12:00:00");
    addSchedules("doctorD", [1, 2, 4], "13:00:00", "17:00:00");

    addSchedules("doctorE", [2, 3, 4, 5, 6], "13:00:00", "17:00:00");
    addSchedules("doctorE", [2, 4], "08:00:00", "11:30:00");

    addSchedules("doctorF", [1, 2, 3, 4, 5], "08:00:00", "12:00:00");
    addSchedules("doctorF", [1, 3, 5], "13:00:00", "16:00:00");

    addSchedules("doctorG", [1, 3, 5], "08:00:00", "12:00:00");
    addSchedules("doctorG", [1, 3, 5], "13:00:00", "17:00:00");
    addSchedules("doctorG", [2, 4], "08:00:00", "11:00:00");

    addSchedules("doctorH", [1, 2, 3, 4, 5], "09:00:00", "12:00:00");
    addSchedules("doctorH", [1, 2, 4], "13:30:00", "17:30:00");

    addSchedules("doctorI", [1, 2, 3, 4, 5, 6], "08:00:00", "11:30:00");
    addSchedules("doctorI", [2, 5], "13:00:00", "16:30:00");

    await WorkSchedule.bulkCreate(schedulePayloads);

    const appointmentPayloads = [
      {
        patient_id: userByUsername.get("patient1").id,
        doctor_id: doctorByUsername.get("doctorA").id,
        date: "2026-04-01",
        time_slot: "08:30:00",
        reason: "Đau ngực khi vận động",
        status: "Completed",
      },
      {
        patient_id: userByUsername.get("patient2").id,
        doctor_id: doctorByUsername.get("doctorA").id,
        date: "2026-04-01",
        time_slot: "09:00:00",
        reason: "Khó thở và hồi hộp",
        status: "CheckedIn",
      },
      {
        patient_id: userByUsername.get("patient3").id,
        doctor_id: doctorByUsername.get("doctorB").id,
        date: "2026-04-01",
        time_slot: "13:30:00",
        reason: "Nổi mẩn đỏ kéo dài",
        status: "Completed",
      },
      {
        patient_id: userByUsername.get("patient4").id,
        doctor_id: doctorByUsername.get("doctorD").id,
        date: "2026-04-02",
        time_slot: "08:30:00",
        reason: "Kiểm tra sức khỏe định kỳ",
        status: "Confirmed",
      },
    ];

    const appointments = await Appointment.bulkCreate(appointmentPayloads);
    const appointmentByIndex = mapBy(appointments, (_, index) => index);

    const queuePayloads = [
      {
        appointmentIndex: 0,
        doctor_id: doctorByUsername.get("doctorA").id,
        date: "2026-04-01",
        queue_number: 1,
        checked_in_at: new Date(withBusinessOffset("2026-04-01", "08:15:00")),
        original_estimated_start: new Date(withBusinessOffset("2026-04-01", "08:30:00")),
        estimated_start: new Date(withBusinessOffset("2026-04-01", "08:30:00")),
        forecast_updated_at: new Date(withBusinessOffset("2026-04-01", "08:15:00")),
        predicted_wait_minutes: 15,
        actual_start: new Date(withBusinessOffset("2026-04-01", "08:32:00")),
        actual_end: new Date(withBusinessOffset("2026-04-01", "08:49:00")),
      },
      {
        appointmentIndex: 1,
        doctor_id: doctorByUsername.get("doctorA").id,
        date: "2026-04-01",
        queue_number: 2,
        checked_in_at: new Date(withBusinessOffset("2026-04-01", "08:40:00")),
        original_estimated_start: new Date(withBusinessOffset("2026-04-01", "09:00:00")),
        estimated_start: new Date(withBusinessOffset("2026-04-01", "09:05:00")),
        forecast_updated_at: new Date(withBusinessOffset("2026-04-01", "08:45:00")),
        predicted_wait_minutes: 25,
      },
      {
        appointmentIndex: 2,
        doctor_id: doctorByUsername.get("doctorB").id,
        date: "2026-04-01",
        queue_number: 1,
        checked_in_at: new Date(withBusinessOffset("2026-04-01", "13:10:00")),
        original_estimated_start: new Date(withBusinessOffset("2026-04-01", "13:30:00")),
        estimated_start: new Date(withBusinessOffset("2026-04-01", "13:28:00")),
        forecast_updated_at: new Date(withBusinessOffset("2026-04-01", "13:10:00")),
        predicted_wait_minutes: 18,
        actual_start: new Date(withBusinessOffset("2026-04-01", "13:29:00")),
        actual_end: new Date(withBusinessOffset("2026-04-01", "13:46:00")),
      },
    ];

    const queues = await Queue.bulkCreate(
      queuePayloads.map((queue) => ({
        appointment_id: appointmentByIndex.get(queue.appointmentIndex).id,
        doctor_id: queue.doctor_id,
        date: queue.date,
        queue_number: queue.queue_number,
        checked_in_at: queue.checked_in_at,
        original_estimated_start: queue.original_estimated_start,
        estimated_start: queue.estimated_start,
        forecast_updated_at: queue.forecast_updated_at,
        predicted_wait_minutes: queue.predicted_wait_minutes,
        actual_start: queue.actual_start || null,
        actual_end: queue.actual_end || null,
      })),
    );

    const waitPredictions = await WaitPrediction.bulkCreate([
      {
        queue_id: queues[0].id,
        predicted_wait_time: 15,
        predicted_start: new Date(withBusinessOffset("2026-04-01", "08:30:00")),
        prediction_source: "rule_engine",
        model_version: "seed_rule_engine_v1",
      },
      {
        queue_id: queues[1].id,
        predicted_wait_time: 25,
        predicted_start: new Date(withBusinessOffset("2026-04-01", "09:05:00")),
        prediction_source: "rule_engine",
        model_version: "seed_rule_engine_v1",
      },
      {
        queue_id: queues[2].id,
        predicted_wait_time: 18,
        predicted_start: new Date(withBusinessOffset("2026-04-01", "13:28:00")),
        prediction_source: "rule_engine",
        model_version: "seed_rule_engine_v1",
      },
    ]);

    for (let index = 0; index < queues.length; index += 1) {
      await queues[index].update({ latest_prediction_id: waitPredictions[index].id });
    }

    const templates = await Template.bulkCreate([
      {
        code: "APPOINTMENT_REMINDER",
        content: "Bạn có lịch khám vào ngày mai.",
        type: "SMS",
        is_active: true,
        description: "Mẫu SMS nhắc lịch hẹn",
      },
      {
        code: "QUEUE_READY",
        content: "Đến lượt khám, vui lòng đến phòng khám.",
        type: "SMS",
        is_active: true,
        description: "Mẫu SMS gọi vào khám",
      },
      {
        code: "CHECKIN_ESTIMATE",
        content: "Bạn đã check-in. Dự kiến vào khám lúc {{predicted_start_time}} tại {{room_display}}.",
        type: "SMS",
        is_active: true,
        description: "Mẫu SMS thông báo dự kiến vào khám sau check-in",
      },
      {
        code: "QUEUE_SOON",
        content: "Dự kiến còn {{predicted_wait_minutes}} phút đến lượt khám. Vui lòng ở gần {{room_display}}.",
        type: "SMS",
        is_active: true,
        description: "Mẫu SMS sắp đến lượt khám",
      },
    ]);

    await SmsLog.bulkCreate([
      {
        phone: userByUsername.get("patient1").phone,
        template_code: templates[0].code,
        content: "Bạn có lịch khám vào ngày mai.",
        status: "Pending",
      },
      {
        phone: userByUsername.get("patient2").phone,
        template_code: templates[1].code,
        content: "Đến lượt khám, vui lòng đến phòng khám.",
        status: "Sent",
      },
    ]);

    await OtpCode.bulkCreate([
      {
        code: "123456",
        phone: userByUsername.get("patient1").phone,
        purpose: "REGISTER",
        expired_time: new Date(Date.now() + 5 * 60 * 1000),
        consumed_at: null,
        status: "Pending",
      },
      {
        code: "654321",
        phone: userByUsername.get("patient2").phone,
        purpose: "REGISTER",
        expired_time: new Date(Date.now() + 5 * 60 * 1000),
        consumed_at: null,
        status: "Verified",
      },
    ]);

    await EQueueNumber.create({
      date: "2026-04-01",
      doctor_id: doctorByUsername.get("doctorA").id,
      current_number: 2,
    });

    console.log("Seed data thành công!");
    process.exit();
  } catch (error) {
    try {
      await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch {
      // Ignore cleanup errors in failure path.
    }
    console.error("Lỗi seed:", error);
    process.exit(1);
  }
}

seed();
