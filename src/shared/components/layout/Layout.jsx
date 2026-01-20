
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const Layout = () => {  return (
    <div className="app-container">
      <Navbar />
      <div className="main-container">
        <Sidebar />
        <main className="content pl-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;