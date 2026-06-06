import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Office } from "../models/Office";
import { Employee } from "../models/Employee";
import { UserRole, OfficeStatus, EmployeeStatus } from "../types/enums";
import { hashPassword } from "../utils/password";

async function dropLegacyIndexes(): Promise<void> {
  const legacy = ["code_1", "employeeCode_1"];
  for (const name of legacy) {
    try {
      await Office.collection.dropIndex(name);
      console.log(`Dropped legacy index: offices.${name}`);
    } catch {
      /* index may not exist */
    }
    try {
      await Employee.collection.dropIndex(name);
      console.log(`Dropped legacy index: employees.${name}`);
    } catch {
      /* index may not exist */
    }
  }
}

async function seed(): Promise<void> {
  await connectDB();
  await dropLegacyIndexes();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@salary.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: "Super Admin",
      email: adminEmail,
      password: await hashPassword(adminPassword),
      role: UserRole.SUPER_ADMIN,
      assignedOfficeIds: [],
    });
    console.log(`Created super admin: ${adminEmail}`);
  } else {
    console.log(`Super admin already exists: ${adminEmail}`);
  }

  const sampleOffices = [
    { name: "Office 1", contactNumber: "9876543210" },
    { name: "Office 2", contactNumber: "9876543211" },
  ];

  const officeDocs = [];
  for (const office of sampleOffices) {
    let doc = await Office.findOne({ name: office.name });
    if (!doc) {
      doc = await Office.create({ ...office, status: OfficeStatus.ACTIVE });
      console.log(`Created office: ${office.name}`);
    }
    officeDocs.push(doc);
  }

  if (officeDocs[0] && (await Employee.countDocuments()) === 0) {
    const samples = [
      { fullName: "Ramesh Patel", mobileNumber: "9876500001", monthlySalary: 25000 },
      { fullName: "Suresh Shah", mobileNumber: "9876500002", monthlySalary: 30000 },
      { fullName: "Mahesh Desai", mobileNumber: "9876500003", monthlySalary: 28000 },
    ];
    for (let i = 0; i < samples.length; i++) {
      const office = officeDocs[i % officeDocs.length];
      await Employee.create({
        ...samples[i],
        dateOfJoining: new Date("2024-01-15"),
        officeId: office._id,
        status: EmployeeStatus.ACTIVE,
      });
      console.log(`Created employee: ${samples[i].fullName}`);
    }
  }

  console.log("\nSeed complete.");
  console.log(`Login: ${adminEmail} / ${adminPassword}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
