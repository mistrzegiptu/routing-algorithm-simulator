from pydantic import BaseModel, validator
from typing import Optional

class RouterCreateRequest(BaseModel):
    name: Optional[str] = None
    port_number: Optional[int] = None

    @validator('name', pre=True, always=True)
    def empty_str_to_none(cls, v):
        if v == "":
            return None
        return v