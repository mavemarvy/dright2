import type { PremiumCourseConfig, PremiumCourseModule } from '../components/PremiumCourseLearningPage';

export type LessonSeed = [title: string, teaching: string, action: string];
export type ModuleSeed = {
  title: string;
  intro: string;
  lessons: [LessonSeed, LessonSeed, LessonSeed];
  deliverable: string;
  principle: string;
};

export type CourseSeed = Omit<PremiumCourseConfig, 'modules'> & {
  regionalContext: string;
  modules: ModuleSeed[];
};

function buildModule(seed: ModuleSeed, regionalContext: string): PremiumCourseModule {
  const lessons = seed.lessons.map(([title, teaching, action]) => ({
    title,
    brief: teaching + ' ' + regionalContext,
    action,
  }));

  return {
    title: seed.title,
    intro: seed.intro,
    principles: [
      seed.principle,
      'Use small, measurable tests before committing major money or client promises.',
      'Keep records, screenshots, calculations and decisions so your work can be reviewed and improved.',
    ],
    mistakes: [
      'Copying a tactic without checking whether it fits the customer, platform, country or economics.',
      'Treating a tool, viral post or one successful example as a guarantee of income or business results.',
    ],
    deliverable: seed.deliverable,
    lessons,
    question: {
      prompt: 'Which approach best matches the DRIGHT method for this module?',
      choices: [
        seed.principle,
        'Skip validation and scale immediately because the tool or platform is popular.',
        'Hide assumptions and judge success only by views, likes or activity.',
      ],
      answer: 0,
      explanation: 'DRIGHT courses prioritize practical validation, documented economics, platform rules and measurable outcomes instead of shortcuts or guarantees.',
    },
  };
}

export function buildCourse(seed: CourseSeed): PremiumCourseConfig {
  return {
    ...seed,
    modules: seed.modules.map((module) => buildModule(module, seed.regionalContext)),
  };
}
