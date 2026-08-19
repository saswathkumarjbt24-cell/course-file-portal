import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './context/SessionContext'
import { useSession } from './context/sessionStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CourseDetail from './pages/CourseDetail'
import MarkEntry from './pages/MarkEntry'
import Attainment from './pages/Attainment'
import Remedial from './pages/Remedial'
import FinalAttainment from './pages/FinalAttainment'
import ClosingReport from './pages/ClosingReport'
import Reports from './pages/Reports'
import Cover from './pages/Cover'
import VisionMission from './pages/VisionMission'
import Outcomes from './pages/Outcomes'
import NameList from './pages/NameList'
import Attendance from './pages/Attendance'
import InternalMarks from './pages/InternalMarks'
import FullCourseFile from './pages/FullCourseFile'
// BEGIN REMOVABLE -- admin Users screen
import Users from './pages/Users'
// END REMOVABLE -- admin Users screen

// With nobody signed in there is nothing to show, so every route falls
// back to the sign-in screen.
function RequireSession() {
  const { faculty } = useSession()
  return faculty ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireSession />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/course/:id" element={<CourseDetail />} />
              <Route path="/course/:id/marks" element={<MarkEntry />} />
              <Route path="/course/:id/attainment" element={<Attainment />} />
              <Route path="/course/:id/remedial" element={<Remedial />} />
              <Route path="/course/:id/final" element={<FinalAttainment />} />
              <Route path="/course/:id/closing" element={<ClosingReport />} />
              <Route path="/course/:id/cover" element={<Cover />} />
              <Route path="/course/:id/vision" element={<VisionMission />} />
              <Route path="/course/:id/outcomes" element={<Outcomes />} />
              <Route path="/course/:id/students" element={<NameList />} />
              <Route path="/course/:id/attendance" element={<Attendance />} />
              <Route path="/course/:id/internal" element={<InternalMarks />} />
              <Route path="/course/:id/full" element={<FullCourseFile />} />
              <Route path="/reports" element={<Reports />} />
              {/* BEGIN REMOVABLE -- admin Users screen.
                  The ROLE guard is inside Users itself, so a faculty member
                  who types this URL is refused in words rather than being
                  redirected somewhere that does not explain why. */}
              <Route path="/users" element={<Users />} />
              {/* END REMOVABLE -- admin Users screen */}
            </Route>
          </Route>
          {/* Unknown paths go to the dashboard, which itself requires a session. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </SessionProvider>
  )
}
