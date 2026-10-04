import { course009 } from './course009';
import { course010 } from './course010';
import { course011 } from './course011';
import { course012 } from './course012';
import { course013 } from './course013';
import { course014 } from './course014';
import { course015 } from './course015';
import { course016 } from './course016';
import { course017 } from './course017';
import { course018 } from './course018';

export const officialCourses009018 = [
  course009, course010, course011, course012, course013,
  course014, course015, course016, course017, course018,
];

export const officialCourse009018BySlug = new Map(
  officialCourses009018.map((course) => [course.slug, course]),
);
