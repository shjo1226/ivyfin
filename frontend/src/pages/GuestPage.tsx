import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPages.css';

const GuestPage: React.FC = () => {
  const { guestRegister } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = (location.state as any)?.redirect || '/';

  const [form, setForm] = useState({
    name: '',
    phone: '',
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

    if (!form.privacyConsent) {
      setError('개인정보 수집 동의가 필요합니다.');
      return;
    }

    setLoading(true);

    try {
      await guestRegister(form);
      navigate(redirect);
    } catch (err: any) {
      setError(err.message || '등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card glass-card animate-fade-in-up">
        <div className="auth-header">
          <div className="guest-badge">⚡ 간편 조회</div>
          <h1>비회원 간편 등록</h1>
          <p>간단한 정보만으로 바로 상담을 시작하세요</p>
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
              id="guest-name"
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
              id="guest-phone"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-group">
              <input
                type="checkbox"
                name="privacyConsent"
                checked={form.privacyConsent}
                onChange={handleChange}
                id="guest-privacy"
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
            id="guest-submit"
          >
            {loading ? '등록 중...' : '상담 시작하기'}
          </button>
        </form>

        <div className="auth-links">
          <p>
            이미 계정이 있으신가요?{' '}
            <Link to="/login" state={{ redirect }}>로그인</Link>
          </p>
          <p>
            회원으로 가입하시겠어요?{' '}
            <Link to="/signup" state={{ redirect }}>회원가입</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default GuestPage;
