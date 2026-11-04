#!/usr/bin/env python3
"""Build a zerank-2 GGUF whose relevance score Ollama can return.

zerank-2 scores a question-passage pair by the raw logit of "Yes" after the
prompt. That logit sits far below the model's top tokens, so the 20
log-probabilities Ollama returns never include it. This copies a zerank-2 GGUF
and gives it an output layer that keeps only the "Yes" row, plus its negation on
"No"; every other token gets logit 0. Ollama's log-probabilities then carry the
score exactly: logprob("Yes") - logprob(any other token) when it is positive,
logprob(any other token) - logprob("No") when it is negative.

    pip install gguf numpy
    ollama pull hf.co/mradermacher/zerank-2-GGUF:Q8_0
    python scripts/build_zerank_ollama.py <that model's GGUF blob> zerank-2-score.gguf
    echo FROM ./zerank-2-score.gguf > Modelfile
    ollama create zerank-2-score -f Modelfile

The blob is the largest file named in
~/.ollama/models/manifests/hf.co/mradermacher/zerank-2-GGUF/Q8_0.
"""

import argparse
from pathlib import Path

import gguf
import numpy as np

YES_TOKEN = "Yes"
NO_TOKEN = "No"


def token_id(reader, token):
    tokens = reader.get_field(gguf.Keys.Tokenizer.LIST)
    return next(i for i in range(len(tokens.data)) if tokens.contents(i) == token)


def score_head(reader):
    tensors = {tensor.name: tensor for tensor in reader.tensors}
    weights = tensors.get("output.weight", tensors["token_embd.weight"])
    yes, no = token_id(reader, YES_TOKEN), token_id(reader, NO_TOKEN)
    row = gguf.quants.dequantize(weights.data[yes : yes + 1], weights.tensor_type)[0]
    head = np.zeros((weights.shape[1], weights.shape[0]), dtype=np.float16)
    head[yes] = row
    head[no] = -row
    return head


def build(source: Path, output: Path):
    reader = gguf.GGUFReader(source)
    writer = gguf.GGUFWriter(
        output,
        arch=reader.get_field(gguf.Keys.General.ARCHITECTURE).contents(),
        endianess=reader.endianess,
    )
    for field in reader.fields.values():
        if field.name == gguf.Keys.General.ARCHITECTURE or field.name.startswith("GGUF."):
            continue
        value_type = field.types[0]
        sub_type = field.types[-1] if value_type == gguf.GGUFValueType.ARRAY else None
        writer.add_key_value(field.name, field.contents(), value_type, sub_type=sub_type)

    head = score_head(reader)
    tensors = [tensor for tensor in reader.tensors if tensor.name != "output.weight"]
    for tensor in tensors:
        writer.add_tensor_info(
            tensor.name, tensor.data.shape, tensor.data.dtype, tensor.data.nbytes, tensor.tensor_type
        )
    writer.add_tensor_info(
        "output.weight", head.shape, head.dtype, head.nbytes, gguf.GGMLQuantizationType.F16
    )

    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_ti_data_to_file()
    for tensor in tensors:
        writer.write_tensor_data(tensor.data, tensor_endianess=reader.endianess)
    writer.write_tensor_data(head)
    writer.close()


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("source", type=Path, help="zerank-2 GGUF")
    parser.add_argument("output", type=Path, help="GGUF to write")
    args = parser.parse_args()
    build(args.source, args.output)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
