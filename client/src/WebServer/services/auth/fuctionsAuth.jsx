// AUTH services
import axios from 'axios';
import api, { API_BASE_URL, setAuthTokens } from '../api';
import { scheduleAccessRefresh, clearAccessRefresh } from '../../utils/accessScheduler';

// עוזר קטן לשמור "מחובר" + מזהה משתמש
function markSignedIn(user, accessToken, expirationTime) {
  console.log("user", user);
  console.log("accessToken", accessToken);
  console.log("expirationTime", expirationTime)
  setAuthTokens(accessToken, expirationTime);
  scheduleAccessRefresh(accessToken);
  console.log("done save token");
  localStorage.setItem('isLoggedIn', '1');
  if (user?._id) localStorage.setItem('user_id', user._id);
  if (user?.roles) localStorage.setItem('roles', user.roles.join(',')); // assuming roles is an array
}

// רישום משתמש חדש (אם יש לך מסך הרשמה)
/**
 * 
 * @param {*} tz |
 * @param {*} from 
 * @param {*} to 
 * @returns 
 */
export async function register(payload) {
  try{
  const { data, status } = await api.post('/auth/register/', payload, { withCredentials: true });
  if (![200,201].includes(status)) throw new Error(data?.message || 'التسجيل فشل');
  return {ok: true, message: data.message || 'التسجيل تم بنجاح'};
  }catch(err){
    console.error('Register error:', err?.response?.data || err.message);
    return {ok: false, message: err.response.data.message || err.message || 'حدث خطأ أثناء العملية.'};
  }
}

// התחברות עם תעודת זהות + סיסמה
export async function login(tz, password) {
  const { data, status } = await api.post('/auth/login', { tz, password }, { withCredentials: true });
  console.log("login", status, data);
  if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'تسجيل الدخول فشل');

  const { accessToken, expirationTime, user } = data;
  markSignedIn(user, accessToken, expirationTime);
  return user;
}

// רענון חד-פעמי ידני (בד"כ לא צריך לקרוא ידנית; ה־interceptor/‏PublicOnly עושה את זה)
export async function refresh() {
  const { data, status } = await axios.post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true });
  if (![200,201].includes(status) || !data?.ok || !data?.accessToken) throw new Error('الدخول منتهي الصلاحية، الرجاء تسجيل الدخول مرة أخرى.');
  setAuthTokens(data.accessToken, data.expirationTime);
  scheduleAccessRefresh(data.accessToken);
  return { accessToken: data.accessToken, expirationTime: data.expirationTime };
}

// זהות עצמי (משתמש מחובר)
export async function getMe() {
  try{
    console.log("getMe baseURL:", api?.defaults?.baseURL);
    console.log("getMe auth:", api?.defaults?.headers?.common?.Authorization);
    console.log("API_BASE_URL:", API_BASE_URL);
    const token = localStorage.getItem("accessToken");
    let res = null;
    res = await axios.get(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
    console.log("res", res);
    const {data, status } = res;
    console.log("getme", status, data, token);
    if (![200,201].includes(status) || !data?.ok) throw new Error(data?.message || 'لا يمكن التعرف على المستخدم.');
    return data.user; // הקומפוננטות אצלך מצפות ל-user ישירות
  }catch(err){
    console.warn("err getme", err);
    alert("err getme: " + err?.response?.data?.message || err.message);
    throw err;
  }
}

// התנתקות
export async function logout() {
  try {
    await api.post('/auth/logout', null, { withCredentials: true });
  } catch {}
  clearAccessRefresh();
  setAuthTokens(null);
  localStorage.clear();
  localStorage.setItem('LOGOUT_BROADCAST', String(Date.now()));
  // אפשר להשאיר לראוטר לנווט, או לבצע redirect קשיח:
  window.location.assign('/');
}

export async function forgotPassword(tz) {
  try {
    const { data, status } = await api.post('/auth/forgot-password', { tz }, { withCredentials: true });
    console.log("forgotPassword", status, data);
    if (![200, 201].includes(status) || !data?.ok) throw new Error(data?.message || 'طلب إعادة تعيين كلمة السر فشل');
    return { ok: true, message: data.message || 'طلب إعادة تعيين كلمة السر تم بنجاح', data: data};
  } catch (err) {
    console.error('Forgot Password error:', err?.response?.data || err.message);
    return { ok: false, message: err.response?.data?.message || err.message || 'حدث خطأ أثناء العملية.' };
  }
}

export async function resetPassword(tz, otp, newPassword, confirmPassword) {
  try {
    const { data, status } = await api.post('/auth/reset-password', { tz, otp, newPassword, confirmPassword }, { withCredentials: true });
    if (![200, 201].includes(status) || !data?.ok) throw new Error(data?.message || 'إعادة تعيين كلمة السر فشل');
    return { ok: true, message: data.message || 'كلمة السر قد تم تعيينها بنجاح' };
  }
  catch (err) {
    console.error('Reset Password error:', err?.response?.data || err.message);
    return { ok: false, message: err.response?.data?.message || err.message || 'حدث خطأ أثناء العملية.' };
  }
}