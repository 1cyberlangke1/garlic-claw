import { AiVisionService } from './ai-vision.service';

describe('AiVisionService', () => {
  const imageCache = {
    findTranscription: jest.fn(),
    saveTranscription: jest.fn(),
  };

  const imageToText = {
    hasVisionFallback: jest.fn(),
    imageToText: jest.fn(),
  };

  let service: AiVisionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiVisionService(
      imageCache as never,
      imageToText as never,
    );
  });

  it('returns cached transcriptions without calling the vision model', async () => {
    imageCache.findTranscription.mockResolvedValue('图片里是一只猫');

    const resolved = await service.resolveImageText(
      'conversation-1',
      'data:image/png;base64,abc123',
      'image/png',
    );

    expect(imageToText.imageToText).not.toHaveBeenCalled();
    expect(resolved).toEqual({
      text: '图片里是一只猫',
      source: 'cache',
    });
  });

  it('generates and stores transcriptions when cache misses and fallback is enabled', async () => {
    imageCache.findTranscription.mockResolvedValue(null);
    imageToText.hasVisionFallback.mockReturnValue(true);
    imageToText.imageToText.mockResolvedValue('图片里是一只猫');

    const resolved = await service.resolveImageText(
      'conversation-1',
      'data:image/png;base64,abc123',
      'image/png',
    );

    expect(imageToText.imageToText).toHaveBeenCalledWith(
      'data:image/png;base64,abc123',
      'image/png',
    );
    expect(imageCache.saveTranscription).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      image: 'data:image/png;base64,abc123',
      mimeType: 'image/png',
      transcription: '图片里是一只猫',
    });
    expect(resolved).toEqual({
      text: '图片里是一只猫',
      source: 'generated',
    });
  });
});
