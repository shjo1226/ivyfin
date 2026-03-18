import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <div className="navbar-logo">
            <span className="logo-icon">🛡️</span>
            <span className="logo-text">GA Korea</span>
          </div>
        </Link>

        <div className="navbar-actions">
          {isAuthenticated ? (
            <>
              <Link to="/records" className="navbar-link">
                내 상담내역
              </Link>
              <Link to="/admin/consultations" className="navbar-link admin-link">
                관리자 예약현황
              </Link>
              <Link to="/profile" className="navbar-user">
                {user?.name}님
              </Link>
              <button className="btn btn-secondary navbar-btn" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary navbar-btn">
                로그인
              </Link>
              <Link to="/signup" className="btn btn-primary navbar-btn">
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
