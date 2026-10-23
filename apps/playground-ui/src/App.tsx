import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell';
import { EmptyState } from './components/ui';
import { LandingPage } from './pages/LandingPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { RunPage } from './pages/RunPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <PlaygroundPage /> },
      { path: '/welcome', element: <LandingPage /> },
      { path: '/runs/:id', element: <RunPage /> },
      { path: '*', element: <EmptyState title="Page not found" /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
