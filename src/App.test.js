import { render, screen } from '@testing-library/react';
import App from './App';

test('renders event attendance tracker', () => {
  render(<App />);
  expect(screen.getByText(/business education department attendance tracker/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^log in$/i })).toBeInTheDocument();
});
