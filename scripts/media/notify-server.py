# A desktop notification server for the recordings, where no desktop runs one: it answers the
# org.freedesktop.Notifications calls the cockpit makes, draws each notification as a small card at the
# top right of the screen, and clicks it when the driver asks (org.example.MediaNotifications.Click), so
# the cockpit receives the same ActionInvoked signal a real click sends.
# Usage: python3 notify-server.py <work dir> <screen width>; needs dbus-python and PyGObject (GLib)
import os
import subprocess
import sys

import dbus
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib
from PIL import Image, ImageDraw

from fonts import ROOT, font

WORK = sys.argv[1]
SCREEN_W = int(sys.argv[2])
BUS = 'org.freedesktop.Notifications'
PATH = '/org/freedesktop/Notifications'
CARD_W, CARD_H, MARGIN = 380, 76, 14
ICON = os.path.join(ROOT, 'packages', 'shell', 'assets', 'app-512.png')


def card(summary, body):
    img = Image.new('RGB', (CARD_W, CARD_H), (40, 42, 46))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=(64, 66, 70))
    if os.path.exists(ICON):
        icon = Image.open(ICON).convert('RGBA').resize((40, 40), Image.LANCZOS)
        img.paste(icon, (16, 18), icon)
    d.text((70, 16), summary, font=font('sans', 14, 600), fill=(236, 236, 236))
    d.text((70, 40), body, font=font('sans', 13), fill=(190, 192, 196))
    return img


class Server(dbus.service.Object):
    def __init__(self, bus):
        super().__init__(bus, PATH)
        self.next_id = 1
        self.shown = {}

    @dbus.service.method(BUS, in_signature='', out_signature='as')
    def GetCapabilities(self):
        return ['actions', 'body']

    @dbus.service.method(BUS, in_signature='', out_signature='ssss')
    def GetServerInformation(self):
        return ('media-notifications', 'example', '1.0', '1.2')

    @dbus.service.method(BUS, in_signature='susssasa{sv}i', out_signature='u')
    def Notify(self, app, replaces, icon, summary, body, actions, hints, timeout):
        nid = replaces or self.next_id
        self.next_id = max(self.next_id, nid) + 1
        self.close_card(nid)
        path = os.path.join(WORK, f'notification-{nid}.png')
        card(str(summary), str(body)).save(path)
        x = SCREEN_W - CARD_W - MARGIN
        self.shown[nid] = subprocess.Popen(['display', '-borderwidth', '0', '-geometry', f'+{x}+{MARGIN}', '-title', 'notification', path])
        print('notify', nid, summary, '|', body, '| actions', list(actions), flush=True)
        return dbus.UInt32(nid)

    @dbus.service.method(BUS, in_signature='u', out_signature='')
    def CloseNotification(self, nid):
        if self.close_card(nid):
            self.NotificationClosed(nid, 3)

    @dbus.service.signal(BUS, signature='uu')
    def NotificationClosed(self, nid, reason):
        pass

    @dbus.service.signal(BUS, signature='us')
    def ActionInvoked(self, nid, action):
        pass

    @dbus.service.method('org.example.MediaNotifications', in_signature='', out_signature='b')
    def Click(self):
        if not self.shown:
            return False
        nid = max(self.shown)
        self.ActionInvoked(dbus.UInt32(nid), 'default')
        self.close_card(nid)
        self.NotificationClosed(dbus.UInt32(nid), 2)
        print('click', nid, flush=True)
        return True

    def close_card(self, nid):
        shown = self.shown.pop(nid, None)
        if shown:
            shown.terminate()
        return shown is not None


dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName(BUS, bus)
server = Server(bus)
print('notification server ready', flush=True)
GLib.MainLoop().run()
