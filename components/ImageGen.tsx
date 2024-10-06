"use client";

import { createClient } from "@/utils/supabase/client";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { useCallback, useEffect, useMemo, useState } from "react";

function useSession(supabase: SupabaseClient) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();

      setSession(session?.session);
    })();
  }, []);

  return session;
}

interface GeneratedImage {
  prompt: string;
  image_b64: string;
}

function usePastImages(supabase: SupabaseClient) {
  const [pastImages, setPastImages] = useState<GeneratedImage[]>([]);

  useEffect(() => {
    (async () => {
      const { data: pastImages } = await supabase
        .from("generated_images")
        .select("*")
        .order("created_at", { ascending: false });

      if (pastImages) {
        setPastImages(
          pastImages.map((row) => ({
            prompt: row.prompt || "",
            image_b64: row.image || "",
          }))
        );
      }
    })();
  }, []);

  const addPastImage = useCallback(
    (image: GeneratedImage) => setPastImages((s) => [image, ...s]),
    []
  );

  return [pastImages, addPastImage] as const;
}

const PROJECT_ID = process.env.NEXT_PUBLIC_SERVERLESSAI_PROJECT_ID!;

function useOpenAI(accessToken: string) {
  return useMemo(
    () =>
      new OpenAI({
        baseURL: "https://openai.api.serverlessai.dev/v1",
        apiKey: `${PROJECT_ID}:${accessToken || ""}`,
        dangerouslyAllowBrowser: true,
      }),
    [accessToken]
  );
}

export default function ImageGen() {
  const supabase = useMemo(createClient, []);

  const session = useSession(supabase);

  const openai = useOpenAI(session?.access_token || "");

  const [pastImages, addPastImage] = usePastImages(supabase);

  const [currentPrompt, setCurrentPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);

  const onClick = async () => {
    setLoading(true);

    if (currentImage) {
      addPastImage(currentImage);
      setCurrentImage(null);
    }

    const result = await openai.images.generate({
      model: "dall-e-2",
      // This is where pop art comes in :)
      prompt: currentPrompt + ", in pop art style",
      size: "256x256",
      // In this example, we simply fetch the images in Base64 and store them in database
      // In production application you may want to upload the images to a dedicated store
      // such as Supabase Storage or AWS S3
      response_format: "b64_json",
    });

    const newImage = {
      prompt: currentPrompt,
      image_b64: result.data[0].b64_json!,
    };

    if (session) {
      await supabase.from("generated_images").insert({
        image: result.data[0].b64_json!,
        prompt: currentPrompt,
        user_id: session.user.id,
      });
    }

    setCurrentImage(newImage);

    setLoading(false);
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-lg">Pop Art Generator</h1>
      <div className="flex items-center">
        <input
          className="rounded-md h-10 text-sm px-4 py-2 bg-inherit border"
          placeholder="Enter your prompt..."
          type="text"
          value={currentPrompt}
          onChange={(e) => setCurrentPrompt(e.currentTarget.value)}
          disabled={loading}
        />
        <button
          className="py-2 px-2 rounded-md no-underline bg-btn-background hover:bg-btn-background-hover"
          disabled={!currentPrompt || loading}
          onClick={onClick}
        >
          Send
        </button>
      </div>

      <div>
        {currentImage && (
          <img
            src={`data:image/png;base64,${currentImage.image_b64}`}
            alt={currentImage.prompt}
          />
        )}
        {loading && (
          <div className="w-[256px] h-[256px] flex items-center justify-center">
            <div>Loading...</div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h2>Past Images</h2>
        <div className="flex flex-wrap">
          {pastImages.map((image, index) => (
            <div className="mb-2 mr-2" key={index}>
              <img
                className="block"
                src={`data:image/png;base64,${image.image_b64}`}
                width={64}
                height={64}
                alt={image.prompt}
              />
              <div className="text-sm">{image.prompt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
