// Onboarding redesign UI verification scenario (local fixture).
import {
  connectAndLogin, evaluate, wait, clickButtonByText, fillInput, check, results,
  cleanup, sleep,
} from './onboarding-ui-check.mjs';

const pickOption = (needle, optIndex) => evaluate(`(() => {
  const ps = [...document.querySelectorAll('p')];
  const q = ps.find(p => p.textContent.includes(${JSON.stringify('')} ) === null ? null : null);
  return true;
})()`);
void pickOption;

const pickQuestion = (needle, optIndex) => evaluate(`((needle, optIndex) => {
  const ps = [...document.querySelectorAll('p')];
  const q = ps.find(p => p.textContent.includes(needle));
  if (!q) throw new Error('question not found: ' + needle);
  const btns = q.parentElement.querySelectorAll('button');
  if (!btns[optIndex]) throw new Error('option missing');
  btns[optIndex].click();
  return btns.length;
})(${JSON.stringify(needle)}, ${optIndex})`);

try {
  await connectAndLogin();
  await clickButtonByText('پرتال مدیریت');
  await fillInput('form input[type="text"]', 'admin');
  await fillInput('form input[type="password"]', 'UiCheck-2026-x');
  await evaluate(`document.querySelector('form input[type="password"]').closest('form').requestSubmit()`);
  await wait(`document.body.innerText.includes('داشبورد') || document.body.innerText.includes('مرکز مدیریت')`, 'post-login app shell');
  check('Admin login via UI', true);

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find(b => b.textContent.includes('آموزش بدو ورود'));
    if (!btn) throw new Error('onboarding nav not found');
    btn.click(); return true;
  })()`);
  await wait(`document.body.innerText.includes('مرکز آموزش داخلی')`, 'onboarding header');
  check('Onboarding view renders', true);

  const hasProgress = await evaluate(`!!document.querySelector('[aria-label="پیشرفت آموزش"]')`);
  check('Progress dashboard visible', hasProgress);

  const roleLabel = await evaluate(`document.body.innerText.includes('نقش شما: مدیر ارشد منابع انسانی')`);
  check('Role-aware header (admin)', roleLabel);

  // Search filtering
  await fillInput('input[type="search"]', 'آزمون');
  await sleep(300);
  const filtered = await evaluate(`[...document.querySelectorAll('button')].filter(b => (b.textContent.match(/بخش \\d+ از/g) || []).length > 0).length`);
  check('Search filters step list', filtered >= 1 && filtered <= 2, 'steps shown: ' + filtered);
  await fillInput('input[type="search"]', '');
  await sleep(200);
  const allSteps = await evaluate(`[...document.querySelectorAll('button')].filter(b => (b.textContent.match(/بخش \\d+ از/g) || []).length > 0).length`);
  check('Search reset restores list', allSteps >= 5, 'steps: ' + allSteps);

  // Navigation
  await clickButtonByText('مرحله بعدی');
  await sleep(200);
  const step2 = await evaluate(`document.body.innerText.includes('ابعاد پنج‌گانه')`);
  check('Next-step navigation works', step2);

  // Quiz with wrong answers
  await clickButtonByText('آزمون تایید صلاحیت');
  await sleep(200);
  const questions = ['۱. در سامانه اصفهان چالاک', '۲. هدف اصلی', '۳. در پروفایل‌های شغلی', '۴. ترتیب صحیح'];
  const wrongPicks = [0, 0, 1, 0];
  for (let i = 0; i < questions.length; i++) {
    const count = await pickQuestion(questions[i], wrongPicks[i]);
    if (count !== 3) throw new Error(`Q${i + 1} option count ${count}`);
  }
  const submitDisabled = await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('ثبت پاسخ'))?.disabled === false`);
  check('Submit enabled after all answered', submitDisabled);
  await clickButtonByText('ثبت پاسخ و ارزیابی آزمون');
  await wait(`document.body.innerText.includes('نتیجه آزمون')`, 'quiz result summary');
  const hasExplanations = await evaluate(`document.body.innerText.includes('پاسخ نادرست') && document.body.innerText.includes('قانون طلایی')`);
  check('Immediate feedback + explanations', hasExplanations);
  const retryBtnPresent = await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('تلاش مجدد'))`);
  check('Retry capability', retryBtnPresent);
} catch (error) {
  check('Scenario completed', false, error.message);
} finally {
  console.log(results.join('\n'));
  await cleanup();
}
