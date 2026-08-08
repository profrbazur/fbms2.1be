import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { seedUsers } from './userSeeder.js';
import { seedOrganizationSettings, seedLocations } from './organizationSeeder.js';
import { seedPersonnel } from './personnelSeeder.js';
import { seedTablets } from './tabletSeeder.js';
import { seedSurveys } from './surveySeeder.js';
import { seedFeedback } from './feedbackSeeder.js';

async function run() {
  await connectDatabase();

  const result = await seedUsers();
  await seedOrganizationSettings();
  const locationResult = await seedLocations();
  const personnelResult = await seedPersonnel();
  const tabletResult = await seedTablets();
  const surveyResult = await seedSurveys();
  const feedbackResult = await seedFeedback();

  console.log(
    `Seeded ${result.departmentCount} department(s) and ${result.userCount} user(s).`,
  );
  result.seededEmails.forEach((email) => console.log(` - ${email}`));
  console.log('Seeded 1 organization settings record.');
  console.log(`Seeded ${locationResult.locationCount} location(s).`);
  console.log(`Seeded ${personnelResult.personnelCount} personnel record(s).`);
  console.log(`Seeded ${tabletResult.tabletCount} tablet(s).`);
  console.log(`Seeded ${surveyResult.surveyCount} survey(s) with ${surveyResult.questionCount} question(s).`);
  console.log(
    `Seeded ${feedbackResult.sessionCount} feedback session(s) with ${feedbackResult.answerCount} answer(s).`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
