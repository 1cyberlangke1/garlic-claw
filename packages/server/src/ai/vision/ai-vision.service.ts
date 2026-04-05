import { Injectable } from '@nestjs/common';
import { ImageToTextService } from './image-to-text.service';
import { ImageTranscriptionCacheService } from './image-transcription-cache.service';

export interface ResolvedAiVisionText {
  text: string | null;
  source: 'cache' | 'generated' | null;
}

@Injectable()
export class AiVisionService {
  constructor(
    private readonly imageCache: ImageTranscriptionCacheService,
    private readonly imageToText: ImageToTextService,
  ) {}

  /**
   * 解析图片的文本描述。
   * @param conversationId 会话 ID
   * @param image 图片内容
   * @param mimeType 图片 MIME 类型
   * @returns 命中的文本描述与来源
   */
  async resolveImageText(
    conversationId: string,
    image: string,
    mimeType?: string,
  ): Promise<ResolvedAiVisionText> {
    const cached = await this.imageCache.findTranscription(conversationId, image);
    if (cached) {
      return {
        text: cached,
        source: 'cache',
      };
    }

    if (!this.imageToText.hasVisionFallback()) {
      return {
        text: null,
        source: null,
      };
    }

    const transcription = await this.imageToText.imageToText(
      image,
      mimeType ?? 'image/png',
    );

    await this.imageCache.saveTranscription({
      conversationId,
      image,
      mimeType,
      transcription,
    });

    return {
      text: transcription,
      source: 'generated',
    };
  }
}
