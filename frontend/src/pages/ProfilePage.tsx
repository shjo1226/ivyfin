import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './ProfilePage.css';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="profile-page">
        <div className="container">
          <p>로그인이 필요합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-container glass-card animate-fade-in-up">
        <div className="profile-header">
          <div className="profile-avatar">
            {user.name.charAt(0)}
          </div>
          <h1 className="profile-name">{user.name} 님</h1>
          <p className="profile-type">{user.isGuest ? '비회원 고객' : '회원 고객'}</p>
        </div>

        <div className="profile-content">
          <div className="info-group">
            <label className="info-label">이름</label>
            <div className="info-value">{user.name}</div>
          </div>

          <div className="info-group">
            <label className="info-label">휴대전화</label>
            <div className="info-value">{user.phone}</div>
          </div>

          {user.birthDate && (
            <div className="info-group">
              <label className="info-label">생년월일</label>
              <div className="info-value">{user.birthDate}</div>
            </div>
          )}

          {/* Note: We need to ensure gender is also available in the User object in AuthContext */}
          {user.gender && (
            <div className="info-group">
              <label className="info-label">성별</label>
              <div className="info-value">{user.gender}</div>
            </div>
          )}

          {!user.isGuest && user.email && (
            <div className="info-group">
              <label className="info-label">이메일</label>
              <div className="info-value">{user.email}</div>
            </div>
          )}
        </div>

        <div className="profile-footer">
          <p className="footer-notice">
            입력하신 정보는 보장 분석 상담을 위한 용도로만 사용됩니다.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
