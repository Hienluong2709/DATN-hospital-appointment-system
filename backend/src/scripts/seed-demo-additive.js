import db from "../models/index.js";
import initAssociations from "../models/associations.js";

const { sequelize, User, Doctor, Specialty, Room, WorkSchedule } = db;

initAssociations(db);

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

const roomPayloads = [
  {
    name: "A101",
    floor: 1,
    specialty: "Tim mạch",
    description: "Phòng khám tim mạch tổng quát, gần khu tiếp đón tầng 1.",
    status: "Available",
  },
  {
    name: "A102",
    floor: 1,
    specialty: "Da liễu",
    description: "Phòng khám da liễu với khu thủ thuật nhỏ và soi da cơ bản.",
    status: "Available",
  },
  {
    name: "A103",
    floor: 1,
    specialty: "Nội tổng quát",
    description: "Phòng khám nội tổng quát cho bệnh nhân theo lịch hẹn và walk-in.",
    status: "Available",
  },
  {
    name: "A104",
    floor: 1,
    specialty: "Tai mũi họng",
    description: "Phòng khám tai mũi họng có khu nội soi và rửa mũi họng.",
    status: "Available",
  },
  {
    name: "B201",
    floor: 2,
    specialty: "Nhi khoa",
    description: "Phòng khám nhi khoa, gần khu chờ riêng cho trẻ em.",
    status: "Available",
  },
  {
    name: "B202",
    floor: 2,
    specialty: "Sản phụ khoa",
    description: "Phòng khám sản phụ khoa định kỳ và tư vấn theo dõi thai.",
    status: "Available",
  },
  {
    name: "B203",
    floor: 2,
    specialty: "Chấn thương chỉnh hình",
    description: "Phòng khám xương khớp và chấn thương chỉnh hình.",
    status: "Available",
  },
  {
    name: "C301",
    floor: 3,
    specialty: "Thần kinh",
    description: "Phòng khám thần kinh và theo dõi tái khám bệnh nhân mạn tính.",
    status: "Available",
  },
  {
    name: "C302",
    floor: 3,
    specialty: "Tiêu hóa",
    description: "Phòng khám tiêu hóa và tư vấn chế độ ăn uống theo bệnh lý.",
    status: "Available",
  },
  {
    name: "C303",
    floor: 3,
    specialty: "Tim mạch",
    description: "Phòng dự phòng cho tim mạch trong giờ cao điểm.",
    status: "Maintenance",
  },
];

const userPayloads = [
  {
    username: "admin",
    password: "123456",
    fullname: "Nguyen Minh Quan",
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
    fullname: "Dang Thu F",
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

const workSchedulePayloads = [
  ...[1, 2, 3, 4, 5].flatMap((dayOfWeek) => ([
    { doctorUsername: "doctorA", day_of_week: dayOfWeek, start_time: "08:00:00", end_time: "12:00:00" },
    { doctorUsername: "doctorA", day_of_week: dayOfWeek, start_time: "13:30:00", end_time: "17:00:00" },
    { doctorUsername: "doctorB", day_of_week: dayOfWeek, start_time: "08:00:00", end_time: "12:00:00" },
    { doctorUsername: "doctorF", day_of_week: dayOfWeek, start_time: "08:00:00", end_time: "12:00:00" },
    { doctorUsername: "doctorH", day_of_week: dayOfWeek, start_time: "09:00:00", end_time: "12:00:00" },
  ])),
  ...[2, 4].flatMap((dayOfWeek) => ([
    { doctorUsername: "doctorB", day_of_week: dayOfWeek, start_time: "13:00:00", end_time: "16:30:00" },
    { doctorUsername: "doctorE", day_of_week: dayOfWeek, start_time: "08:00:00", end_time: "11:30:00" },
    { doctorUsername: "doctorI", day_of_week: dayOfWeek, start_time: "13:00:00", end_time: "16:30:00" },
  ])),
  ...[1, 3, 5].flatMap((dayOfWeek) => ([
    { doctorUsername: "doctorC", day_of_week: dayOfWeek, start_time: "07:30:00", end_time: "11:30:00" },
    { doctorUsername: "doctorC", day_of_week: dayOfWeek, start_time: "13:00:00", end_time: "16:30:00" },
    { doctorUsername: "doctorG", day_of_week: dayOfWeek, start_time: "08:00:00", end_time: "12:00:00" },
    { doctorUsername: "doctorG", day_of_week: dayOfWeek, start_time: "13:00:00", end_time: "17:00:00" },
    { doctorUsername: "doctorF", day_of_week: dayOfWeek, start_time: "13:00:00", end_time: "16:00:00" },
  ])),
  ...[2, 4].map((dayOfWeek) => ({
    doctorUsername: "doctorC",
    day_of_week: dayOfWeek,
    start_time: "08:00:00",
    end_time: "11:30:00",
  })),
  ...[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    doctorUsername: "doctorD",
    day_of_week: dayOfWeek,
    start_time: "08:00:00",
    end_time: "12:00:00",
  })),
  ...[1, 2, 4].flatMap((dayOfWeek) => ([
    { doctorUsername: "doctorD", day_of_week: dayOfWeek, start_time: "13:00:00", end_time: "17:00:00" },
    { doctorUsername: "doctorH", day_of_week: dayOfWeek, start_time: "13:30:00", end_time: "17:30:00" },
  ])),
  ...[2, 3, 4, 5, 6].map((dayOfWeek) => ({
    doctorUsername: "doctorE",
    day_of_week: dayOfWeek,
    start_time: "13:00:00",
    end_time: "17:00:00",
  })),
  ...[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    doctorUsername: "doctorI",
    day_of_week: dayOfWeek,
    start_time: "08:00:00",
    end_time: "11:30:00",
  })),
  { doctorUsername: "doctorA", day_of_week: 6, start_time: "08:00:00", end_time: "11:30:00" },
];

const syncAttributes = async (instance, values) => {
  const changed = Object.entries(values).some(([key, value]) => instance.get(key) !== value);
  if (changed) {
    await instance.update(values);
  }
  return changed;
};

const upsertSpecialties = async () => {
  const specialtiesByName = new Map();
  let created = 0;
  let updated = 0;

  for (const payload of specialtyPayloads) {
    const [specialty, isCreated] = await Specialty.findOrCreate({
      where: { name: payload.name },
      defaults: payload,
    });

    if (isCreated) {
      created += 1;
    } else if (await syncAttributes(specialty, { description: payload.description })) {
      updated += 1;
    }

    specialtiesByName.set(payload.name, specialty);
  }

  return { specialtiesByName, created, updated };
};

const upsertRooms = async (specialtiesByName) => {
  const roomsByName = new Map();
  let created = 0;
  let updated = 0;

  for (const payload of roomPayloads) {
    const values = {
      floor: payload.floor,
      specialty_id: specialtiesByName.get(payload.specialty).id,
      description: payload.description,
      status: payload.status,
    };
    const [room, isCreated] = await Room.findOrCreate({
      where: { name: payload.name },
      defaults: {
        name: payload.name,
        ...values,
      },
    });

    if (isCreated) {
      created += 1;
    } else if (await syncAttributes(room, values)) {
      updated += 1;
    }

    roomsByName.set(payload.name, room);
  }

  return { roomsByName, created, updated };
};

const upsertUsers = async () => {
  const usersByUsername = new Map();
  let created = 0;
  let updated = 0;

  for (const payload of userPayloads) {
    const existing = await User.findOne({ where: { username: payload.username } });
    if (!existing) {
      const createdUser = await User.create(payload);
      usersByUsername.set(payload.username, createdUser);
      created += 1;
      continue;
    }

    const changed = await syncAttributes(existing, {
      fullname: payload.fullname,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
      gender: payload.gender ?? null,
      address: payload.address ?? null,
    });
    if (changed) {
      updated += 1;
    }
    usersByUsername.set(payload.username, existing);
  }

  return { usersByUsername, created, updated };
};

const upsertDoctors = async (usersByUsername, specialtiesByName, roomsByName) => {
  const doctorsByUsername = new Map();
  let created = 0;
  let updated = 0;

  for (const payload of doctorPayloads) {
    const values = {
      specialty_id: specialtiesByName.get(payload.specialty).id,
      room_id: roomsByName.get(payload.room).id,
      description: payload.description,
      status: "Active",
    };
    const user = usersByUsername.get(payload.username);
    const [doctor, isCreated] = await Doctor.findOrCreate({
      where: { user_id: user.id },
      defaults: {
        user_id: user.id,
        ...values,
      },
    });

    if (isCreated) {
      created += 1;
    } else if (await syncAttributes(doctor, values)) {
      updated += 1;
    }

    doctorsByUsername.set(payload.username, doctor);
  }

  return { doctorsByUsername, created, updated };
};

const upsertWorkSchedules = async (doctorsByUsername) => {
  let created = 0;

  for (const payload of workSchedulePayloads) {
    const doctor = doctorsByUsername.get(payload.doctorUsername);
    const [, isCreated] = await WorkSchedule.findOrCreate({
      where: {
        doctor_id: doctor.id,
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        end_time: payload.end_time,
      },
      defaults: {
        doctor_id: doctor.id,
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        end_time: payload.end_time,
      },
    });

    if (isCreated) {
      created += 1;
    }
  }

  return { created };
};

async function seedDemoAdditive() {
  try {
    await sequelize.authenticate();
    console.log("🌱 Seeding additive demo data...");

    const specialtyResult = await upsertSpecialties();
    const roomResult = await upsertRooms(specialtyResult.specialtiesByName);
    const userResult = await upsertUsers();
    const doctorResult = await upsertDoctors(
      userResult.usersByUsername,
      specialtyResult.specialtiesByName,
      roomResult.roomsByName,
    );
    const scheduleResult = await upsertWorkSchedules(doctorResult.doctorsByUsername);

    console.log("Additive demo data hoàn tất.");
    console.log(
      JSON.stringify(
        {
          specialties_created: specialtyResult.created,
          specialties_updated: specialtyResult.updated,
          rooms_created: roomResult.created,
          rooms_updated: roomResult.updated,
          users_created: userResult.created,
          users_updated: userResult.updated,
          doctors_created: doctorResult.created,
          doctors_updated: doctorResult.updated,
          work_schedules_created: scheduleResult.created,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (error) {
    console.error("Lỗi additive seed:", error);
    process.exit(1);
  }
}

seedDemoAdditive();
