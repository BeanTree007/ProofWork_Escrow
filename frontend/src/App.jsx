import { Route, Routes } from "react-router-dom";
import Navigation from "./components/Navigation";
import Footer from "./components/Footer";
import Landing from "./pages/Landing";
import CreateProject from "./pages/CreateProject";
import Dashboard from "./pages/Dashboard";
import Project from "./pages/Project";
import SubmitWebsite from "./pages/SubmitWebsite";
import VerificationReport from "./pages/VerificationReport";
import ExtensionRequests from "./pages/ExtensionRequests";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Navigation />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/create" element={<CreateProject />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects/:id" element={<Project />} />
          <Route path="/submit" element={<SubmitWebsite />} />
          <Route path="/report" element={<VerificationReport />} />
          <Route path="/extensions" element={<ExtensionRequests />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
