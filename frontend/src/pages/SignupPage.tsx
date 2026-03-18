import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPages.css';

const SignupPage: React.FC = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = (location.state as any)?.redirect || '/';

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    privacyConsent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (!form.privacyConsent) {
      setError('개인정보 수집 동의가 필요합니다.');
      return;
    }

    setLoading(true);

    try {
      await signup({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        privacyConsent: form.privacyConsent,
      });
      navigate(redirect);
    } catch (err: any) {
      setError(err.message || '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card glass-card animate-fade-in-up">
        <div className="auth-header">
          <h1>회원가입</h1>
          <p>보험 보장 분석 서비스에 가입하세요</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">이름</label>
            <input
              type="text"
              className="form-input"
              placeholder="이름을 입력하세요"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              id="signup-name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">이메일</label>
            <input
              type="email"
              className="form-input"
              placeholder="이메일을 입력하세요"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              id="signup-email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">전화번호</label>
            <input
              type="tel"
              className="form-input"
              placeholder="010-0000-0000"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              required
              id="signup-phone"
            />
          </div>

          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input
              type="password"
              className="form-input"
              placeholder="6자 이상 입력하세요"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              id="signup-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">비밀번호 확인</label>
            <input
              type="password"
              className="form-input"
              placeholder="비밀번호를 다시 입력하세요"
              name="passwordConfirm"
              value={form.passwordConfirm}
              onChange={handleChange}
              required
              id="signup-password-confirm"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-group">
              <input
                type="checkbox"
                name="privacyConsent"
                checked={form.privacyConsent}
                onChange={handleChange}
                id="signup-privacy"
              />
              <span className="checkbox-label">
                [필수] 개인정보 수집 및 이용에 동의합니다. 수집된 개인정보는 보험 보장 분석 상담 목적으로만 사용되며, 상담 완료 후 안전하게 처리됩니다.
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-large"
            disabled={loading}
            id="signup-submit"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="auth-links">
          <p>
            이미 계정이 있으신가요?{' '}
            <Link to="/login" state={{ redirect }}>로그인</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
