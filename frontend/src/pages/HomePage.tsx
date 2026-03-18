import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './HomePage.css';

const HomePage: React.FC = () => {
  const { isAuthenticated, guestRegister } = useAuth();
  const navigate = useNavigate();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [pendingType, setPendingType] = useState<'chat' | 'voice'>('chat');
  const [form, setForm] = useState({
    name: '',
    birthDate: '',
    phone: '',
    gender: '남자' as '남자' | '여자',
    privacyConsent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConsultation = (type: 'chat' | 'voice') => {
    if (isAuthenticated) {
      navigate(`/${type}`);
      return;
    }
    // Not logged in — show inline registration modal
    setPendingType(type);
    setShowModal(true);
    setError('');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleGenderSelect = (gender: '남자' | '여자') => {
    setForm(prev => ({ ...prev, gender }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (!form.phone.trim()) {
      setError('휴대전화 번호를 입력해주세요.');
      return;
    }
    if (!form.privacyConsent) {
      setError('개인정보 수집 동의가 필요합니다.');
      return;
    }

    setLoading(true);
    try {
      await guestRegister({
        name: form.name.trim(),
        phone: form.phone.replace(/-/g, '').trim(),
        birthDate: form.birthDate.trim() || undefined,
        gender: form.gender,
        privacyConsent: form.privacyConsent,
      });
      setShowModal(false);
      navigate(`/${pendingType}`);
    } catch (err: any) {
      setError(err.message || '등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setError('');
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
        <div className="hero-content">
          <div className="hero-badge animate-fade-in-up">
            <span>🛡️</span> AI 보험 보장 분석 서비스
          </div>
          <h1 className="hero-title animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            나에게 필요한<br />
            <span className="hero-highlight">보험 상품</span>을 알아보세요
          </h1>
          <p className="hero-description animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            보험 보장 분석을 통해 필요하지 않은 보험료를 아끼세요.<br />
            AI 전문 상담사가 고객님의 보험을 꼼꼼히 분석해 드립니다.
          </p>
          <div className="hero-cta animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <button
              className="btn btn-primary btn-large cta-btn"
              onClick={() => handleConsultation('chat')}
              id="cta-chat"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              채팅 상담 시작
            </button>
            <button
              className="btn btn-secondary btn-large cta-btn"
              onClick={() => handleConsultation('voice')}
              id="cta-voice"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              전화 상담 시작
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="features-inner">
          <h2 className="section-title">왜 보장 분석이 필요한가요?</h2>
          <div className="feature-grid">
            <div className="feature-card glass-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="feature-icon">📊</div>
              <h3>중복 보장 확인</h3>
              <p>갖고 계신 모든 보험을 한 장의 파일로 정리하여 중복된 보장을 확인해 드립니다.</p>
            </div>
            <div className="feature-card glass-card animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="feature-icon">💰</div>
              <h3>불필요한 보험료 절감</h3>
              <p>불필요한 보험료는 줄이고 부족한 부분은 채워드릴 수 있도록 전문가가 분석합니다.</p>
            </div>
            <div className="feature-card glass-card animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <div className="feature-icon">🏥</div>
              <h3>5세대 실손 대비</h3>
              <p>개정된 5세대 실손 본인 부담금 증가에 대비하여 치료비, 간병비 등을 체크합니다.</p>
            </div>
            <div className="feature-card glass-card animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="feature-icon">👨‍💼</div>
              <h3>전문가 방문 상담</h3>
              <p>정확한 분석을 위해 전문가가 직접 방문하여 리포트를 제공해 드립니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="process">
        <div className="process-inner">
          <h2 className="section-title">상담 진행 절차</h2>
          <div className="process-steps">
            <div className="process-step">
              <div className="step-number">01</div>
              <h3>상담 신청</h3>
              <p>채팅 또는 전화로 AI 상담사에게 보장 분석을 신청하세요.</p>
            </div>
            <div className="process-connector" />
            <div className="process-step">
              <div className="step-number">02</div>
              <h3>본인 확인</h3>
              <p>간단한 본인 확인과 건강 상태를 체크합니다.</p>
            </div>
            <div className="process-connector" />
            <div className="process-step">
              <div className="step-number">03</div>
              <h3>정보 수집</h3>
              <p>보험료, 관심 분야 등 분석에 필요한 정보를 수집합니다.</p>
            </div>
            <div className="process-connector" />
            <div className="process-step">
              <div className="step-number">04</div>
              <h3>전문가 배정</h3>
              <p>GA 코리아 전문가가 배정되어 방문 상담을 진행합니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="cta-bottom">
        <div className="cta-bottom-inner glass-card">
          <h2>지금 바로 보험 점검을 시작하세요</h2>
          <p>AI 상담사가 고객님의 보험을 꼼꼼히 분석해 드립니다</p>
          <div className="cta-bottom-buttons">
            <button className="btn btn-primary btn-large" onClick={() => handleConsultation('chat')}>
              💬 채팅 상담
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => handleConsultation('voice')}>
              📞 전화 상담
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>© 2024 GA Korea. All rights reserved.</p>
        <p className="footer-sub">본 서비스는 데모 목적으로 제작되었습니다.</p>
      </footer>

      {/* ===== Quick Registration Modal ===== */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-container glass-card animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} id="modal-close">✕</button>

            <div className="modal-header">
              <h2>간편하게 보험료를 확인하세요</h2>
              <p className="modal-sub">무료 상담을 위해 아래 정보를 입력해주세요</p>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <form className="quick-form" onSubmit={handleSubmit}>
              {/* 성별 - Top & Center */}
              <div className="quick-field gender-top">
                <div className="gender-toggle center">
                  <button
                    type="button"
                    className={`gender-btn ${form.gender === '남자' ? 'active' : ''}`}
                    onClick={() => handleGenderSelect('남자')}
                    id="gender-male"
                  >
                    {form.gender === '남자' && <span className="gender-check">✓</span>}
                    남자
                  </button>
                  <button
                    type="button"
                    className={`gender-btn ${form.gender === '여자' ? 'active' : ''}`}
                    onClick={() => handleGenderSelect('여자')}
                    id="gender-female"
                  >
                    {form.gender === '여자' && <span className="gender-check">✓</span>}
                    여자
                  </button>
                </div>
              </div>

              <div className="quick-form-inputs">
                {/* 이름 */}
                <div className="quick-field">
                  <label className="quick-label">이름</label>
                  <input
                    type="text"
                    className="quick-input"
                    placeholder="이름"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    id="quick-name"
                  />
                </div>

                {/* 생년월일 */}
                <div className="quick-field">
                  <label className="quick-label">생년월일</label>
                  <input
                    type="text"
                    className="quick-input"
                    placeholder="예) 19860514"
                    name="birthDate"
                    value={form.birthDate}
                    onChange={handleChange}
                    id="quick-birthdate"
                  />
                </div>

                {/* 휴대전화 */}
                <div className="quick-field">
                  <label className="quick-label">휴대전화</label>
                  <input
                    type="tel"
                    className="quick-input"
                    placeholder="-없이 번호입력하세요"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    required
                    id="quick-phone"
                  />
                </div>
              </div>

              {/* 개인정보 동의 */}
              <div className="quick-privacy">
                <label className="checkbox-group">
                  <input
                    type="checkbox"
                    name="privacyConsent"
                    checked={form.privacyConsent}
                    onChange={handleChange}
                    id="quick-privacy"
                  />
                  <span className="checkbox-label">
                    [필수] <a href="#" className="privacy-link" onClick={e => e.preventDefault()}>개인정보 처리방침</a>에 동의합니다.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-accent btn-large btn-full quick-submit"
                disabled={loading}
                id="quick-submit"
              >
                {loading ? '등록 중...' : '상담신청'}
              </button>
            </form>

            <div className="modal-login-link">
              이미 계정이 있으신가요? <a onClick={() => { setShowModal(false); navigate('/login', { state: { redirect: `/${pendingType}` } }); }}>로그인</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
