/**
 * UI smoke test: boots the real App (navigation, MeshProvider, engine, store)
 * with mocked native modules and walks the main SOS flow.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Animated, PermissionsAndroid, Platform } from 'react-native';
import App from '../App';

jest.setTimeout(30000);

// Endless splash animations would keep the JS loop busy under Jest.
beforeAll(() => {
  // RescueMesh is Android-first: run the UI as Android, with permissions granted.
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({} as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: () => {}, stop: () => {}, reset: () => {} } as never);
});

describe('RescueMesh app', () => {
  it('onboards, creates an offline SOS and shows its delivery status', async () => {
    await render(<App />);
    expect(screen.getByText('RescueMesh')).toBeTruthy();
    expect(screen.getByText(/Communities Become the Network/)).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Get Started')).toBeTruthy(), { timeout: 8000 });
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Asha Varghese'), 'Test User');
    await fireEvent.press(screen.getByText('Get Started'));

    await waitFor(() => expect(screen.getByText('SOS')).toBeTruthy());
    expect(screen.getByText('OFFLINE')).toBeTruthy();
    expect(screen.getByText('You have not sent any SOS alerts.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Send SOS'));
    await waitFor(() => expect(screen.getByText('Emergency category')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('9.49810, 76.33880')).toBeTruthy());
    await fireEvent.press(screen.getByText('Flood'));
    expect(screen.getByText(/Immediate rescue or evacuation needed \(suggested\)/)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText(/Water at chest level/), 'Family of 4 on roof');
    await fireEvent.press(screen.getByText('Send SOS'));

    await waitFor(() => expect(screen.getByText('SOS saved')).toBeTruthy());
    expect(screen.getAllByText('Saved on this device').length).toBeGreaterThan(0);
    expect(screen.getByText('Family of 4 on roof')).toBeTruthy();
    expect(screen.getByText(/does not mean rescuers have it yet/)).toBeTruthy();
  });
});
