// Handwriting recognition for ink in notes and study cards. On Windows this
// uses the recogniser built into the system (Windows.UI.Input.Inking): offline,
// nothing to download, in every language whose handwriting pack is installed.
// Other systems report that it is not available yet.
use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, String>;

/// One stroke: points as [x, y, pressure].
#[derive(Deserialize)]
pub struct Stroke {
    pub p: Vec<[f32; 3]>,
}

#[derive(Serialize, Default)]
pub struct Line {
    /// Best guess first, then alternatives.
    pub candidates: Vec<String>,
    pub top: f32,
    pub left: f32,
    /// The reader was not sure of this word.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub unsure: bool,
}

#[cfg(windows)]
mod system {
    use super::{Line, Result, Stroke};
    use windows::core::HSTRING;
    use windows_collections::IIterable;
    use windows_numerics::Matrix3x2;
    use windows::Foundation::Point;
    use windows::UI::Input::Inking::{
        InkPoint, InkRecognitionTarget, InkRecognizerContainer, InkStrokeBuilder, InkStrokeContainer,
    };

    fn err(e: windows::core::Error) -> String {
        format!("Handwriting recognition failed: {}", e.message())
    }

    pub fn recognizers() -> Result<Vec<String>> {
        let container = InkRecognizerContainer::new().map_err(err)?;
        let list = container.GetRecognizers().map_err(err)?;
        Ok(list.into_iter().filter_map(|r| r.Name().ok()).map(|n| n.to_string()).collect())
    }

    pub fn recognize(strokes: &[Stroke], recognizer: Option<&str>) -> Result<Vec<Line>> {
        let builder = InkStrokeBuilder::new().map_err(err)?;
        let ink = InkStrokeContainer::new().map_err(err)?;
        let identity = Matrix3x2 { M11: 1.0, M12: 0.0, M21: 0.0, M22: 1.0, M31: 0.0, M32: 0.0 };
        let mut added = 0;
        for stroke in strokes {
            if stroke.p.len() < 2 {
                continue;
            }
            let points: Vec<Option<InkPoint>> = stroke
                .p
                .iter()
                .filter_map(|[x, y, pressure]| {
                    InkPoint::CreateInkPoint(Point { X: *x, Y: *y }, pressure.clamp(0.05, 1.0)).ok().map(Some)
                })
                .collect();
            let iterable: IIterable<InkPoint> = points.into();
            let s = builder.CreateStrokeFromInkPoints(&iterable, identity).map_err(err)?;
            ink.AddStroke(&s).map_err(err)?;
            added += 1;
        }
        if added == 0 {
            return Ok(vec![]);
        }
        let container = InkRecognizerContainer::new().map_err(err)?;
        if let Some(name) = recognizer.filter(|n| !n.is_empty()) {
            let wanted = HSTRING::from(name);
            for r in container.GetRecognizers().map_err(err)? {
                if r.Name().map(|n| n == wanted).unwrap_or(false) {
                    container.SetDefaultRecognizer(&r).map_err(err)?;
                    break;
                }
            }
        }
        let results = container.RecognizeAsync(&ink, InkRecognitionTarget::All).map_err(err)?.join().map_err(err)?;
        let mut lines = vec![];
        for r in results {
            let candidates: Vec<String> = r.GetTextCandidates().map_err(err)?.into_iter().map(|c: HSTRING| c.to_string()).collect();
            let rect = r.BoundingRect().map_err(err)?;
            if !candidates.is_empty() {
                lines.push(Line { candidates, top: rect.Y, left: rect.X, unsure: false });
            }
        }
        Ok(lines)
    }
}

#[cfg(not(windows))]
mod system {
    use super::{Line, Result, Stroke};
    pub fn recognizers() -> Result<Vec<String>> {
        Ok(vec![])
    }
    pub fn recognize(_strokes: &[Stroke], _recognizer: Option<&str>) -> Result<Vec<Line>> {
        Err("Handwriting recognition is available on Windows for now.".into())
    }
}

pub use system::{recognize, recognizers};

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    // Draws "LO" with straight strokes and a circle, the way a pen would.
    fn letters() -> Vec<Stroke> {
        let line = |a: (f32, f32), b: (f32, f32)| Stroke {
            p: (0..=20).map(|i| i as f32 / 20.0).map(|t| [a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t, 0.5]).collect(),
        };
        let circle = Stroke {
            p: (0..=48)
                .map(|i| i as f32 / 48.0 * std::f32::consts::TAU)
                .map(|a| [150.0 + 35.0 * a.sin(), 60.0 - 40.0 * a.cos(), 0.5])
                .collect(),
        };
        vec![line((40.0, 20.0), (40.0, 100.0)), line((40.0, 100.0), (90.0, 100.0)), circle]
    }

    #[test]
    #[ignore = "needs the Windows handwriting recogniser"]
    fn windows_reads_simple_letters() {
        let names = recognizers().unwrap();
        println!("recognizers: {names:?}");
        assert!(!names.is_empty());
        let lines = recognize(&letters(), None).unwrap();
        println!("read: {:?}", lines.iter().map(|l| &l.candidates).collect::<Vec<_>>());
        assert!(!lines.is_empty());
    }
}
