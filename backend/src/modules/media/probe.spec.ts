import { canServeMasterDirectly, planLadder, summariseMaster, trackLabel, type ProbeResult } from './probe';

/**
 * These decisions used to be implicit in a script, and getting them wrong is
 * exactly what produced an episode with one quality and no tracks. The fixture
 * below is the real Solo Leveling master, stream for stream.
 */
describe('master probe', () => {
  const SOLO_LEVELING: ProbeResult = {
    format: { format_name: 'matroska,webm', duration: '1420.096000', size: '419700370', bit_rate: '2364000' },
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'hevc',
        profile: 'Main 10',
        width: 1920,
        height: 1080,
        pix_fmt: 'yuv420p10le',
        r_frame_rate: '24000/1001',
        disposition: { default: 1 },
      },
      { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '44100', tags: { language: 'hin' }, disposition: { default: 1 } },
      { index: 2, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '44100', tags: { language: 'jpn' }, disposition: { default: 0 } },
      { index: 3, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'eng' }, disposition: { default: 1 } },
    ],
  };

  describe('the real master', () => {
    const summary = summariseMaster(SOLO_LEVELING);

    it('reads the container and duration', () => {
      expect(summary.container).toBe('matroska,webm');
      expect(Math.round(summary.durationSeconds)).toBe(1420);
    });

    it('finds both audio streams rather than collapsing them', () => {
      expect(summary.audio).toHaveLength(2);
      expect(summary.audio.map((a) => a.language)).toEqual(['hin', 'jpn']);
      expect(summary.audio.map((a) => a.label)).toEqual(['Hindi', 'Japanese']);
      expect(summary.audio[0].isDefault).toBe(true);
    });

    it('finds the English subtitle and knows it converts to WebVTT', () => {
      expect(summary.subtitles).toHaveLength(1);
      expect(summary.subtitles[0]).toMatchObject({ language: 'eng', label: 'English', codec: 'subrip', isTextBased: true });
    });

    it('recognises that the video cannot be served to a browser as-is', () => {
      expect(summary.video).toMatchObject({ codec: 'hevc', width: 1920, height: 1080, pixFmt: 'yuv420p10le' });
      expect(summary.video?.frameRate).toBeCloseTo(23.976, 2);
      expect(summary.video?.browserPlayable).toBe(false);
      expect(canServeMasterDirectly(summary)).toBe(false);
    });
  });

  describe('language labelling', () => {
    it('never invents a language when the tag is missing', () => {
      const probe: ProbeResult = {
        streams: [
          { index: 0, codec_type: 'audio', codec_name: 'aac' },
          { index: 1, codec_type: 'audio', codec_name: 'aac', tags: { language: 'und' } },
        ],
      };
      const { audio } = summariseMaster(probe);
      expect(audio.map((a) => a.language)).toEqual([null, null]);
      expect(audio.map((a) => a.label)).toEqual(['Audio 1', 'Audio 2']);
    });

    it('prefers a real track title over the language name', () => {
      expect(trackLabel('jpn', 'Director commentary', 1, 'Audio')).toBe('Director commentary');
    });

    it('falls back to the raw code for a language it does not know', () => {
      expect(trackLabel('xyz', undefined, 1, 'Audio')).toBe('XYZ');
    });
  });

  describe('subtitles', () => {
    it('reports a bitmap subtitle as present but not convertible', () => {
      const probe: ProbeResult = {
        streams: [{ index: 0, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'eng' } }],
      };
      const { subtitles } = summariseMaster(probe);
      expect(subtitles[0].isTextBased).toBe(false);
    });

    it('finds no subtitle track in a hardsubbed file', () => {
      // DATE A LIVE: one untagged audio stream, subtitles burned into the video.
      const probe: ProbeResult = {
        streams: [
          { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p', r_frame_rate: '24000/1001' },
          { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2 },
        ],
      };
      const summary = summariseMaster(probe);
      expect(summary.subtitles).toHaveLength(0);
      expect(summary.audio).toHaveLength(1);
      expect(summary.video?.browserPlayable).toBe(true);
      expect(canServeMasterDirectly(summary)).toBe(true);
    });

    it('marks a forced subtitle', () => {
      const probe: ProbeResult = {
        streams: [{ index: 0, codec_type: 'subtitle', codec_name: 'subrip', disposition: { forced: 1 }, tags: { language: 'eng' } }],
      };
      expect(summariseMaster(probe).subtitles[0].isForced).toBe(true);
    });
  });

  describe('ladder', () => {
    it('gives a 1080p master all four steps', () => {
      expect(planLadder(1080).map((s) => s.quality)).toEqual(['Q_1080P', 'Q_720P', 'Q_480P', 'Q_360P']);
    });

    it('never upscales', () => {
      expect(planLadder(720).map((s) => s.quality)).toEqual(['Q_720P', 'Q_480P', 'Q_360P']);
      expect(planLadder(480).map((s) => s.quality)).toEqual(['Q_480P', 'Q_360P']);
      expect(planLadder(360).map((s) => s.quality)).toEqual(['Q_360P']);
    });

    it('treats a slightly-off height as its nominal step', () => {
      // 1088 and 1084 are real encoder outputs for "1080p".
      expect(planLadder(1088).map((s) => s.quality)).toContain('Q_1080P');
    });

    it('returns nothing for an unusable height', () => {
      expect(planLadder(0)).toEqual([]);
    });
  });

  describe('browser playability', () => {
    it('accepts 8-bit H.264', () => {
      const probe: ProbeResult = {
        streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, pix_fmt: 'yuv420p' }],
      };
      expect(summariseMaster(probe).video?.browserPlayable).toBe(true);
    });

    it('rejects 10-bit H.264, which looks fine until it does not play', () => {
      const probe: ProbeResult = {
        streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p10le' }],
      };
      const video = summariseMaster(probe).video;
      expect(video?.browserPlayable).toBe(false);
      expect(video?.reason).toMatch(/not widely supported|10-bit/);
    });

    it('ignores embedded cover art when picking the video stream', () => {
      const probe: ProbeResult = {
        streams: [
          { index: 0, codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 }, width: 600, height: 900 },
          { index: 1, codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, pix_fmt: 'yuv420p' },
        ],
      };
      expect(summariseMaster(probe).video?.codec).toBe('h264');
    });
  });
});
