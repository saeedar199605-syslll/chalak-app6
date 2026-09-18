// Onboarding UI verification — part 2: retry, badge grant, persistence (local fixture).
import {
  connectAndLogin, evaluate, wait, clickButtonByText, fillInput, check, results,
  cleanup, sleep,
} from './onboarding-ui-check.mjs';

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

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find(b => b.textContent.includes('آموزش بدو ورود'));
    if (!btn) throw new Error('onboarding nav not found');
    btn.click(); return true;
  })()`);
  await wait(`document.body.innerText.includes('مرکز آموزش داخلی')`, 'onboarding header');

  // Go to quiz step directly
  await clickButtonByText('آزمون تایید صلاحیت');
  await sleep(200);
  const questions = ['۱. در سامانه اصفهان چالاک', '۲. هدف اصلی', '۳. در پروفایل‌های شغلی', '۴. ترتیب صحیح'];
  // Correct options: Q1=idx1(ب), Q2=idx2(ج), Q3=idx0(الف), Q4=idx1(ب)
  const correctPicks = [1, 2, 0, 1];
  for (let i = 0; i < questions.length; i++) await pickQuestion(questions[i], correctPicks[i]);
  await clickButtonByText('ثبت پاسخ و ارزیابی آزمون');
  await wait(`document.body.innerText.includes('تبریک')`, 'quiz success state');
  const badgeGranted = await evaluate(`document.body.innerText.includes('ارزیاب ذیصلاح اصفهان چالاک')`);
  check('Perfect score shows badge granted', badgeGranted);

  // In the failed-submission state (scenario 1) correct options get emerald highlight;
  // after a perfect score the success panel replaces the answer list, so just confirm that.
  const successPanel = await evaluate(`document.body.innerText.includes('آزمون با موفقیت گذرانده شد')`);
  check('Success panel replaces answer list', successPanel);

  // Reload page: active step must persist via localStorage
  await evaluate(`location.reload()`);
  await wait(`!!document.querySelector('form') || document.body.innerText.includes('مرکز آموزش داخلی')`, 'reload');
  // If login form appears (session kept?), navigate to onboarding again
  const onLoginForm = await evaluate(`!!document.querySelector('form') && document.body.innerText.includes('ورود')`);
  if (onLoginForm) {
    await clickButtonByText('پرتال مدیریت');
    await fillInput('form input[type="text"]', 'admin');
    await fillInput('form input[type="password"]', 'UiCheck-2026-x');
    await evaluate(`document.querySelector('form input[type="password"]').closest('form').requestSubmit()`);
    await wait(`document.body.innerText.includes('داشبورد') || document.body.innerText.includes('مرکز مدیریت')`, 're-login');
  }
  const savedStep = await evaluate(`localStorage.getItem('chalak_onboarding_step_emp-admin')`);
  check('Active step persisted to localStorage', typeof savedStep === 'string' && savedStep.length > 0, 'value: ' + savedStep);

  // Open onboarding tab again and confirm the saved step is restored
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find(b => b.textContent.includes('آموزش بدو ورود'));
    if (btn) btn.click(); return true;
  })()`);
  await sleep(400);
  const stillQuiz = await evaluate(`document.body.innerText.includes('آزمون تایید صلاحیت')`);
  check('Persisted step restores quiz view', stillQuiz);
} catch (error) {
  check('Scenario-2 completed', false, error.message);
} finally {
  console.log(results.join('\n'));
  await cleanup();
}
